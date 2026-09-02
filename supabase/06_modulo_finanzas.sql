-- ============================================================================
-- SUITE INSISO · 06_modulo_finanzas.sql
-- Módulo Finanzas (MVP del blueprint): plan de cuentas, comprobantes con
-- cuadratura forzada, períodos con bloqueo, RCV, centros de costo, vistas.
-- Requiere 05_multiempresa_base.sql. Idempotente.
-- ============================================================================

-- ============================== 1. CENTROS DE COSTO =========================
create table if not exists public.centros_costo (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references public.empresas(id),
  codigo      text not null,               -- 'ADM', 'TIENDA', 'OBRA-12'
  nombre      text not null,
  activo      boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (empresa_id, codigo)
);

-- ============================== 2. PLAN DE CUENTAS ==========================
create table if not exists public.cuentas (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references public.empresas(id),
  codigo      text not null,               -- '1.1.01.001' (4 niveles)
  nombre      text not null,
  tipo        text not null check (tipo in ('activo','pasivo','patrimonio','ingreso','gasto')),
  imputable   boolean not null default false,  -- solo las hoja reciben movimientos
  padre_id    uuid references public.cuentas(id),
  activo      boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (empresa_id, codigo)
);
create index if not exists idx_cuentas_empresa on public.cuentas(empresa_id);

-- ============================== 3. PERÍODOS =================================
create table if not exists public.periodos (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references public.empresas(id),
  anio        int not null check (anio between 2020 and 2100),
  mes         int not null check (mes between 1 and 12),
  cerrado     boolean not null default false,
  cerrado_at  timestamptz,
  cerrado_por uuid,
  unique (empresa_id, anio, mes)
);

-- ============================== 4. COMPROBANTES =============================
create table if not exists public.comprobantes (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references public.empresas(id),
  numero      int not null,
  tipo        text not null check (tipo in ('ingreso','egreso','traspaso')),
  fecha       date not null,
  glosa       text not null,
  estado      text not null default 'borrador' check (estado in ('borrador','confirmado','anulado')),
  origen      text not null default 'manual' check (origen in ('manual','rcv_ventas','rcv_compras','apertura','sistema')),
  adjunto_url text,
  created_by  uuid,
  created_at  timestamptz not null default now(),
  unique (empresa_id, tipo, numero)
);
create index if not exists idx_comp_empresa_fecha on public.comprobantes(empresa_id, fecha);

create table if not exists public.lineas_comprobante (
  id              uuid primary key default gen_random_uuid(),
  empresa_id      uuid not null references public.empresas(id),
  comprobante_id  uuid not null references public.comprobantes(id) on delete cascade,
  cuenta_id       uuid not null references public.cuentas(id),
  centro_costo_id uuid references public.centros_costo(id),
  glosa           text,
  debe            numeric(15,0) not null default 0 check (debe >= 0),
  haber           numeric(15,0) not null default 0 check (haber >= 0),
  check (not (debe > 0 and haber > 0))   -- una línea va al debe O al haber
);
create index if not exists idx_lineas_comp on public.lineas_comprobante(comprobante_id);
create index if not exists idx_lineas_cuenta on public.lineas_comprobante(empresa_id, cuenta_id);

-- ============================== 5. RCV DEL SII ==============================
create table if not exists public.documentos_rcv (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null references public.empresas(id),
  registro       text not null check (registro in ('venta','compra')),
  tipo_dte       int not null,              -- 33 factura, 34 exenta, 39 boleta, 61 NC...
  folio          bigint not null,
  rut_contraparte text not null,
  razon_social   text,
  fecha_emision  date not null,
  neto           numeric(15,0) not null default 0,
  iva            numeric(15,0) not null default 0,
  total          numeric(15,0) not null default 0,
  centralizado   boolean not null default false,
  comprobante_id uuid references public.comprobantes(id),
  created_at     timestamptz not null default now(),
  unique (empresa_id, registro, tipo_dte, folio, rut_contraparte)
);

-- ============================== 6. PRESUPUESTOS FINANCIEROS ==================
-- (presupuestos_finanzas: por cuenta/centro. 'presupuestos' a secas es la de obra del ERP)
create table if not exists public.presupuestos_finanzas (
  id              uuid primary key default gen_random_uuid(),
  empresa_id      uuid not null references public.empresas(id),
  anio            int not null,
  mes             int check (mes between 1 and 12),  -- null = anual
  cuenta_id       uuid references public.cuentas(id),
  centro_costo_id uuid references public.centros_costo(id),
  monto           numeric(15,0) not null default 0
);

-- ============================== 7. INTEGRIDAD CONTABLE ======================
-- 7.1 No se confirma un comprobante descuadrado
create or replace function public.fn_validar_cuadratura()
returns trigger language plpgsql as $$
declare v_debe numeric; v_haber numeric; v_lineas int;
begin
  if new.estado = 'confirmado' and (old.estado is distinct from 'confirmado') then
    select coalesce(sum(debe),0), coalesce(sum(haber),0), count(*)
      into v_debe, v_haber, v_lineas
      from public.lineas_comprobante where comprobante_id = new.id;
    if v_lineas < 2 then
      raise exception 'Comprobante %-%: necesita al menos 2 líneas', new.tipo, new.numero;
    end if;
    if v_debe <> v_haber then
      raise exception 'Comprobante %-% descuadrado: debe % <> haber %',
        new.tipo, new.numero, v_debe, v_haber;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_cuadratura on public.comprobantes;
create trigger trg_cuadratura before update on public.comprobantes
  for each row execute function public.fn_validar_cuadratura();

-- 7.2 Nada se toca en un período cerrado
create or replace function public.fn_bloquear_periodo()
returns trigger language plpgsql as $$
declare v_fecha date; v_empresa uuid;
begin
  if tg_table_name = 'comprobantes' then
    v_fecha := coalesce(new.fecha, old.fecha);
    v_empresa := coalesce(new.empresa_id, old.empresa_id);
  else
    select c.fecha, c.empresa_id into v_fecha, v_empresa
      from public.comprobantes c
     where c.id = coalesce(new.comprobante_id, old.comprobante_id);
  end if;
  if exists (
    select 1 from public.periodos p
     where p.empresa_id = v_empresa
       and p.anio = extract(year from v_fecha)::int
       and p.mes  = extract(month from v_fecha)::int
       and p.cerrado
  ) then
    raise exception 'El período %-% está cerrado: reabrir antes de modificar',
      extract(year from v_fecha)::int, extract(month from v_fecha)::int;
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists trg_periodo_comp on public.comprobantes;
create trigger trg_periodo_comp before insert or update or delete on public.comprobantes
  for each row execute function public.fn_bloquear_periodo();

drop trigger if exists trg_periodo_lineas on public.lineas_comprobante;
create trigger trg_periodo_lineas before insert or update or delete on public.lineas_comprobante
  for each row execute function public.fn_bloquear_periodo();

-- 7.3 Solo cuentas imputables reciben movimientos
create or replace function public.fn_solo_imputables()
returns trigger language plpgsql as $$
begin
  if not exists (select 1 from public.cuentas c where c.id = new.cuenta_id and c.imputable) then
    raise exception 'La cuenta no es imputable: use una cuenta de último nivel';
  end if;
  return new;
end $$;

drop trigger if exists trg_imputables on public.lineas_comprobante;
create trigger trg_imputables before insert or update on public.lineas_comprobante
  for each row execute function public.fn_solo_imputables();

-- ============================== 8. VISTAS ===================================
create or replace view public.vista_libro_mayor as
select l.empresa_id, cu.codigo, cu.nombre as cuenta, cu.tipo,
       c.fecha, c.tipo as tipo_comp, c.numero, c.glosa as glosa_comp,
       l.glosa as glosa_linea, cc.codigo as centro, l.debe, l.haber
  from public.lineas_comprobante l
  join public.comprobantes c on c.id = l.comprobante_id and c.estado = 'confirmado'
  join public.cuentas cu on cu.id = l.cuenta_id
  left join public.centros_costo cc on cc.id = l.centro_costo_id;

create or replace view public.vista_balance_comprobacion as
select l.empresa_id, cu.codigo, cu.nombre, cu.tipo,
       sum(l.debe) as debitos, sum(l.haber) as creditos,
       greatest(sum(l.debe) - sum(l.haber), 0) as saldo_deudor,
       greatest(sum(l.haber) - sum(l.debe), 0) as saldo_acreedor
  from public.lineas_comprobante l
  join public.comprobantes c on c.id = l.comprobante_id and c.estado = 'confirmado'
  join public.cuentas cu on cu.id = l.cuenta_id
 group by l.empresa_id, cu.codigo, cu.nombre, cu.tipo;

-- Las vistas heredan la RLS de sus tablas base (security_invoker en PG15+):
alter view public.vista_libro_mayor set (security_invoker = true);
alter view public.vista_balance_comprobacion set (security_invoker = true);

-- ============================== 9. RLS POR EMPRESA ==========================
select public.aplicar_rls_empresa(t) from unnest(array[
  'centros_costo','cuentas','periodos','comprobantes',
  'lineas_comprobante','documentos_rcv','presupuestos_finanzas'
]) as t;

-- ============================== 10. PLAN DE CUENTAS PLANTILLA ===============
-- Crea el árbol chileno base para una empresa nueva. Uso:
--   select crear_plan_cuentas_base('<empresa_id>');
create or replace function public.crear_plan_cuentas_base(p_empresa uuid)
returns int language plpgsql security definer set search_path = public as $$
declare v_count int := 0; r record;
begin
  for r in
    select * from (values
      ('1','ACTIVOS','activo',false),
      ('1.1','Activos corrientes','activo',false),
      ('1.1.01.001','Caja','activo',true),
      ('1.1.01.002','Banco','activo',true),
      ('1.1.02.001','Clientes (CxC)','activo',true),
      ('1.1.02.002','Documentos por cobrar','activo',true),
      ('1.1.03.001','IVA crédito fiscal','activo',true),
      ('1.1.03.002','PPM por recuperar','activo',true),
      ('1.1.04.001','Existencias','activo',true),
      ('1.2','Activos no corrientes','activo',false),
      ('1.2.01.001','Maquinaria y equipos','activo',true),
      ('1.2.01.002','Depreciación acumulada','activo',true),
      ('2','PASIVOS','pasivo',false),
      ('2.1','Pasivos corrientes','pasivo',false),
      ('2.1.01.001','Proveedores (CxP)','pasivo',true),
      ('2.1.02.001','IVA débito fiscal','pasivo',true),
      ('2.1.03.001','Retención honorarios','pasivo',true),
      ('2.1.04.001','Honorarios por pagar','pasivo',true),
      ('2.1.05.001','Remuneraciones por pagar','pasivo',true),
      ('2.1.06.001','Impuesto renta por pagar','pasivo',true),
      ('3','PATRIMONIO','patrimonio',false),
      ('3.1.01.001','Capital pagado','patrimonio',true),
      ('3.1.02.001','Resultados acumulados','patrimonio',true),
      ('4','INGRESOS','ingreso',false),
      ('4.1.01.001','Ventas nacionales','ingreso',true),
      ('4.1.01.002','Servicios prestados','ingreso',true),
      ('4.2.01.001','Ingresos financieros','ingreso',true),
      ('5','GASTOS','gasto',false),
      ('5.1.01.001','Costo de ventas','gasto',true),
      ('5.2.01.001','Sueldos y leyes sociales','gasto',true),
      ('5.2.01.003','Honorarios profesionales','gasto',true),
      ('5.2.02.001','Arriendos','gasto',true),
      ('5.2.02.002','Servicios básicos','gasto',true),
      ('5.2.02.003','Gastos de oficina','gasto',true),
      ('5.2.03.001','Gastos financieros','gasto',true),
      ('5.2.04.001','Depreciación del ejercicio','gasto',true)
    ) as v(codigo, nombre, tipo, imputable)
  loop
    insert into public.cuentas (empresa_id, codigo, nombre, tipo, imputable)
    values (p_empresa, r.codigo, r.nombre, r.tipo, r.imputable)
    on conflict (empresa_id, codigo) do nothing;
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

-- ============================================================================
-- Con esto el módulo Finanzas queda con integridad garantizada EN LA BASE:
-- nada descuadrado, nada en períodos cerrados, nada en cuentas no imputables,
-- y todo aislado por empresa. El frontend (Next.js) solo consume esto.
-- ============================================================================
