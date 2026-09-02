-- ============================================================================
--  ERP FAPAMA — Paso 4: Finanzas, Abastecimiento y Subcontratos
--  Control de gestión: Presupuesto vs. Comprometido vs. Real
--
--  Ejecutar UNA vez en: Supabase Dashboard > SQL Editor > pegar > Run
--  Requisito: haber ejecutado instalacion_completa.sql
--  IDEMPOTENTE: puede correrse varias veces sin error. NO borra datos.
--
--  Modelo financiero:
--    DISPONIBLE = PRESUPUESTO − COMPROMETIDO − REAL
--      · COMPROMETIDO = saldo no facturado de subcontratos Vigentes
--                       Σ (monto_total_contratado − monto_ejecutado)
--      · REAL         = subcontratos ejecutados + facturas directas aprobadas
--                       + gastos manuales + consumo de materiales valorizado
--    Las facturas de subcontrato NO se suman dos veces: solo mueven monto del
--    "comprometido" al "real" dentro del propio subcontrato (anti-duplicidad).
-- ============================================================================

-- ----------------------------------------------------------------------------
--  0. Utilidades base (idempotentes)
-- ----------------------------------------------------------------------------

-- Rol del usuario autenticado (definido también en el paso 3; se re-asegura aquí)
create or replace function public.mi_rol()
returns text language sql stable security definer set search_path = public as $$
  select rol::text from public.usuarios where auth_user_id = auth.uid() limit 1;
$$;

-- Exige que el usuario tenga uno de los roles indicados (si no, aborta)
create or replace function public.fn_exige_rol(p_roles text[])
returns void language plpgsql stable security definer set search_path = public as $$
declare v_rol text;
begin
  v_rol := public.mi_rol();
  if v_rol is null or not (v_rol = any (p_roles)) then
    raise exception 'No autorizado. Se requiere uno de los roles: %.', array_to_string(p_roles, ', ')
      using errcode = '42501';
  end if;
end; $$;

-- Validación de RUT chileno (módulo 11). Acepta con/sin puntos, con guión.
create or replace function public.fn_validar_rut(p_rut text)
returns boolean language plpgsql immutable as $$
declare
  v_rut text; v_cuerpo text; v_dv text;
  v_suma int := 0; v_mult int := 2; i int; v_calc int; v_dv_calc text;
begin
  if p_rut is null then return false; end if;
  v_rut := upper(regexp_replace(p_rut, '[.\s]', '', 'g'));   -- quita puntos y espacios
  if v_rut !~ '^[0-9]+-[0-9K]$' then return false; end if;    -- exige formato cuerpo-DV
  v_cuerpo := split_part(v_rut, '-', 1);
  v_dv := split_part(v_rut, '-', 2);
  if length(v_cuerpo) < 7 then return false; end if;
  for i in reverse length(v_cuerpo)..1 loop
    v_suma := v_suma + substring(v_cuerpo from i for 1)::int * v_mult;
    v_mult := v_mult + 1;
    if v_mult > 7 then v_mult := 2; end if;
  end loop;
  v_calc := 11 - (v_suma % 11);
  v_dv_calc := case when v_calc = 11 then '0' when v_calc = 10 then 'K' else v_calc::text end;
  return v_dv_calc = v_dv;
end; $$;

-- Tipos enumerados
do $$ begin
  create type estado_subcontrato as enum ('Vigente', 'Finalizado', 'Anulado');
exception when duplicate_object then null; end $$;

do $$ begin
  create type estado_factura as enum ('Pendiente', 'Aprobada', 'Pagada', 'Anulada');
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------------------
--  1. MODELOS
-- ----------------------------------------------------------------------------

-- Proveedores ----------------------------------------------------------------
create table if not exists proveedores (
  id            uuid primary key default gen_random_uuid(),
  rut           text not null unique,
  razon_social  text not null,
  contacto      text,
  email         text,
  telefono      text,
  categoria     text,
  activo        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint chk_rut_valido check (public.fn_validar_rut(rut))
);

drop trigger if exists trg_proveedores_updated on proveedores;
create trigger trg_proveedores_updated before update on proveedores
  for each row execute function fn_set_updated_at();

-- Subcontratos ---------------------------------------------------------------
create table if not exists subcontratos (
  id                     uuid primary key default gen_random_uuid(),
  proyecto_id            uuid not null references proyectos(id) on delete cascade,
  proveedor_id           uuid not null references proveedores(id) on delete restrict,
  glosa                  text not null,
  monto_total_contratado numeric(16,2) not null check (monto_total_contratado > 0),
  monto_ejecutado        numeric(16,2) not null default 0 check (monto_ejecutado >= 0),
  estado                 estado_subcontrato not null default 'Vigente',
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

drop trigger if exists trg_subcontratos_updated on subcontratos;
create trigger trg_subcontratos_updated before update on subcontratos
  for each row execute function fn_set_updated_at();

create index if not exists idx_subcontratos_proyecto on subcontratos(proyecto_id);
create index if not exists idx_subcontratos_proveedor on subcontratos(proveedor_id);

-- Facturas -------------------------------------------------------------------
create table if not exists facturas (
  id              uuid primary key default gen_random_uuid(),
  numero_factura  text not null,
  proveedor_id    uuid not null references proveedores(id) on delete restrict,
  proyecto_id     uuid not null references proyectos(id) on delete cascade,
  subcontrato_id  uuid references subcontratos(id) on delete set null,   -- opcional
  monto_total     numeric(16,2) not null default 0 check (monto_total >= 0),
  fecha           date not null default current_date,
  estado          estado_factura not null default 'Pendiente',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (proveedor_id, numero_factura)                                   -- no duplicar folio por proveedor
);

drop trigger if exists trg_facturas_updated on facturas;
create trigger trg_facturas_updated before update on facturas
  for each row execute function fn_set_updated_at();

create index if not exists idx_facturas_proyecto on facturas(proyecto_id);
create index if not exists idx_facturas_subcontrato on facturas(subcontrato_id);
create index if not exists idx_facturas_proveedor on facturas(proveedor_id);

-- Detalle de factura (historial de precios) ----------------------------------
create table if not exists detalle_factura (
  id              uuid primary key default gen_random_uuid(),
  factura_id      uuid not null references facturas(id) on delete cascade,
  producto        text not null,
  cantidad        numeric(16,3) not null check (cantidad > 0),
  precio_unitario numeric(16,2) not null check (precio_unitario >= 0),
  subtotal        numeric(16,2) generated always as (round(cantidad * precio_unitario, 2)) stored,
  created_at      timestamptz not null default now()
);

create index if not exists idx_detalle_factura on detalle_factura(factura_id);
create index if not exists idx_detalle_producto on detalle_factura(lower(producto));

-- ----------------------------------------------------------------------------
--  2. CONTROL DE PRESUPUESTO (Presupuesto / Comprometido / Real / Disponible)
-- ----------------------------------------------------------------------------

create or replace function public.fn_estado_presupuesto(p_proyecto_id uuid)
returns table (presupuesto numeric, comprometido numeric, costo_real numeric, disponible numeric)
language sql stable security definer set search_path = public as $$
  select
    p.presupuesto_total as presupuesto,
    coalesce(c.comprometido, 0) as comprometido,
    coalesce(r.costo_real, 0) as costo_real,
    p.presupuesto_total - coalesce(c.comprometido, 0) - coalesce(r.costo_real, 0) as disponible
  from proyectos p
  -- COMPROMETIDO: saldo no ejecutado de subcontratos Vigentes
  left join (
    select proyecto_id, sum(greatest(monto_total_contratado - monto_ejecutado, 0)) as comprometido
    from subcontratos where estado = 'Vigente' group by proyecto_id
  ) c on c.proyecto_id = p.id
  -- REAL: ejecutado de subcontratos + facturas directas + gastos + materiales
  left join (
    select proyecto_id, sum(monto) as costo_real from (
      select proyecto_id, monto_ejecutado as monto from subcontratos
      union all
      select proyecto_id, monto_total from facturas
        where subcontrato_id is null and estado in ('Aprobada', 'Pagada')
      union all
      select proyecto_id, monto from gastos
      union all
      select proyecto_id, (cantidad * costo_unitario) from movimientos_kardex
        where tipo = 'SALIDA' and proyecto_id is not null
    ) t group by proyecto_id
  ) r on r.proyecto_id = p.id
  where p.id = p_proyecto_id;
$$;

-- Vista de control presupuestal por proyecto (para dashboards/reportes)
create or replace view vista_control_presupuestal as
select
  p.id as proyecto_id, p.codigo, p.nombre, p.estado,
  p.presupuesto_total as presupuesto,
  coalesce(c.comprometido, 0) as comprometido,
  coalesce(r.costo_real, 0) as costo_real,
  p.presupuesto_total - coalesce(c.comprometido, 0) - coalesce(r.costo_real, 0) as disponible,
  case when p.presupuesto_total > 0
    then round(((coalesce(c.comprometido,0) + coalesce(r.costo_real,0)) / p.presupuesto_total) * 100, 1)
    else 0 end as porcentaje_consumido
from proyectos p
left join (
  select proyecto_id, sum(greatest(monto_total_contratado - monto_ejecutado, 0)) as comprometido
  from subcontratos where estado = 'Vigente' group by proyecto_id
) c on c.proyecto_id = p.id
left join (
  select proyecto_id, sum(monto) as costo_real from (
    select proyecto_id, monto_ejecutado as monto from subcontratos
    union all select proyecto_id, monto_total from facturas where subcontrato_id is null and estado in ('Aprobada','Pagada')
    union all select proyecto_id, monto from gastos
    union all select proyecto_id, (cantidad * costo_unitario) from movimientos_kardex where tipo='SALIDA' and proyecto_id is not null
  ) t group by proyecto_id
) r on r.proyecto_id = p.id;

alter view vista_control_presupuestal set (security_invoker = true);

-- ----------------------------------------------------------------------------
--  3. LÓGICA TRANSACCIONAL ATÓMICA
--     Cada función es una transacción: si hay sobregiro (y no se fuerza) o un
--     error, se revierte TODO automáticamente (consistencia financiera).
-- ----------------------------------------------------------------------------

-- (B) Crear subcontrato → marca su monto como COMPROMETIDO de inmediato.
-- (C) Valida desviación: si Comprometido+Real supera el Presupuesto, bloquea
--     (salvo p_forzar = true para override del administrador).
create or replace function public.fn_crear_subcontrato(
  p_proyecto_id uuid, p_proveedor_id uuid, p_glosa text,
  p_monto_total numeric, p_forzar boolean default false
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_disp numeric;
begin
  perform fn_exige_rol(array['Administrador', 'Jefe de Proyecto']);
  if coalesce(p_monto_total, 0) <= 0 then
    raise exception 'El monto del subcontrato debe ser mayor a 0.';
  end if;

  insert into subcontratos (proyecto_id, proveedor_id, glosa, monto_total_contratado, estado)
  values (p_proyecto_id, p_proveedor_id, p_glosa, p_monto_total, 'Vigente')
  returning id into v_id;

  select disponible into v_disp from fn_estado_presupuesto(p_proyecto_id);
  if v_disp < 0 and not p_forzar then
    raise exception 'DESVIACION_PRESUPUESTO: este subcontrato deja el proyecto con saldo % (sobregiro de %). Apruebe con forzar=true si corresponde.',
      v_disp, abs(v_disp) using errcode = 'P0001';
  end if;
  return v_id;
end; $$;

create or replace function public.fn_finalizar_subcontrato(p_subcontrato_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform fn_exige_rol(array['Administrador', 'Jefe de Proyecto']);
  update subcontratos set estado = 'Finalizado' where id = p_subcontrato_id;
  if not found then raise exception 'Subcontrato no encontrado.'; end if;
end; $$;

-- (A) Crear factura (estado Pendiente) con su detalle. No impacta presupuesto
--     hasta que se apruebe. p_detalles: arreglo JSON [{producto, cantidad, precio_unitario}].
create or replace function public.fn_crear_factura(
  p_numero text, p_proveedor_id uuid, p_proyecto_id uuid,
  p_subcontrato_id uuid, p_fecha date, p_monto_total numeric,
  p_detalles jsonb default '[]'::jsonb
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_factura_id uuid; v_det jsonb; v_total numeric := 0; v_count int := 0;
begin
  perform fn_exige_rol(array['Administrador', 'Jefe de Proyecto', 'Adquisiciones']);
  if coalesce(trim(p_numero), '') = '' then
    raise exception 'El número de factura es obligatorio.';
  end if;

  insert into facturas (numero_factura, proveedor_id, proyecto_id, subcontrato_id, monto_total, fecha, estado)
  values (p_numero, p_proveedor_id, p_proyecto_id, p_subcontrato_id, coalesce(p_monto_total, 0),
          coalesce(p_fecha, current_date), 'Pendiente')
  returning id into v_factura_id;

  if p_detalles is not null and jsonb_typeof(p_detalles) = 'array' then
    for v_det in select * from jsonb_array_elements(p_detalles) loop
      insert into detalle_factura (factura_id, producto, cantidad, precio_unitario)
      values (v_factura_id, v_det->>'producto',
              (v_det->>'cantidad')::numeric, (v_det->>'precio_unitario')::numeric);
      v_total := v_total + (v_det->>'cantidad')::numeric * (v_det->>'precio_unitario')::numeric;
      v_count := v_count + 1;
    end loop;
  end if;

  -- Si vino detalle, el monto total es la suma de subtotales (autoritativo)
  if v_count > 0 then
    update facturas set monto_total = round(v_total, 2) where id = v_factura_id;
  end if;
  return v_factura_id;
end; $$;

-- (A) Aprobar factura → impacta el presupuesto del proyecto.
--   · Si tiene subcontrato: recalcula monto_ejecutado del subcontrato
--     (mueve del "comprometido" al "real", sin duplicar el gasto).
--   · Si es directa: el monto pasa directo a "real".
--   · Valida desviación (C): bloquea si supera el presupuesto, salvo p_forzar.
create or replace function public.fn_aprobar_factura(p_factura_id uuid, p_forzar boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_f facturas; v_disp numeric;
begin
  perform fn_exige_rol(array['Administrador', 'Jefe de Proyecto']);
  select * into v_f from facturas where id = p_factura_id;
  if not found then raise exception 'Factura no encontrada.'; end if;
  if v_f.estado = 'Anulada' then raise exception 'La factura está anulada.'; end if;

  update facturas set estado = 'Aprobada' where id = p_factura_id and estado <> 'Pagada';

  if v_f.subcontrato_id is not null then
    update subcontratos s set monto_ejecutado = (
      select coalesce(sum(monto_total), 0) from facturas f
      where f.subcontrato_id = s.id and f.estado in ('Aprobada', 'Pagada')
    ) where s.id = v_f.subcontrato_id;
  end if;

  select disponible into v_disp from fn_estado_presupuesto(v_f.proyecto_id);
  if v_disp < 0 and not p_forzar then
    raise exception 'DESVIACION_PRESUPUESTO: aprobar esta factura deja el proyecto con saldo % (sobregiro de %). Apruebe con forzar=true si corresponde.',
      v_disp, abs(v_disp) using errcode = 'P0001';
  end if;
  return jsonb_build_object('ok', true, 'disponible', v_disp);
end; $$;

create or replace function public.fn_pagar_factura(p_factura_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_f facturas;
begin
  perform fn_exige_rol(array['Administrador', 'Jefe de Proyecto']);
  select * into v_f from facturas where id = p_factura_id;
  if not found then raise exception 'Factura no encontrada.'; end if;
  if v_f.estado not in ('Aprobada', 'Pagada') then
    raise exception 'Solo se pueden pagar facturas aprobadas.';
  end if;
  update facturas set estado = 'Pagada' where id = p_factura_id;
  if v_f.subcontrato_id is not null then
    update subcontratos s set monto_ejecutado = (
      select coalesce(sum(monto_total), 0) from facturas f
      where f.subcontrato_id = s.id and f.estado in ('Aprobada', 'Pagada')
    ) where s.id = v_f.subcontrato_id;
  end if;
end; $$;

-- ----------------------------------------------------------------------------
--  4. INTELIGENCIA DE ABASTECIMIENTO — Comparador de precios por ítem
--     Devuelve, por proveedor, el MEJOR precio histórico del ítem buscado,
--     la fecha de la última compra y el folio de referencia. Orden: precio asc.
-- ----------------------------------------------------------------------------
create or replace function public.fn_comparar_precios(p_busqueda text)
returns table (
  proveedor_id uuid, razon_social text, producto text,
  mejor_precio numeric, ultima_compra date, numero_factura text
) language sql stable security invoker set search_path = public as $$
  with base as (
    select pr.id as proveedor_id, pr.razon_social, d.producto,
           d.precio_unitario, f.fecha, f.numero_factura
    from detalle_factura d
    join facturas f on f.id = d.factura_id
    join proveedores pr on pr.id = f.proveedor_id
    where p_busqueda is not null and d.producto ilike '%' || p_busqueda || '%'
  ),
  mejores as (
    select distinct on (proveedor_id, producto)
      proveedor_id, razon_social, producto,
      precio_unitario as mejor_precio, numero_factura
    from base
    order by proveedor_id, producto, precio_unitario asc, fecha desc
  ),
  ultimas as (
    select proveedor_id, producto, max(fecha) as ultima_compra
    from base group by proveedor_id, producto
  )
  select m.proveedor_id, m.razon_social, m.producto, m.mejor_precio,
         u.ultima_compra, m.numero_factura
  from mejores m
  join ultimas u on u.proveedor_id = m.proveedor_id and u.producto = m.producto
  order by m.mejor_precio asc;
$$;

-- ----------------------------------------------------------------------------
--  5. SEGURIDAD (RLS) de los nuevos modelos
--     · proveedores / facturas / detalle_factura : Admin, Jefe de Proyecto, Adquisiciones
--     · subcontratos                              : Admin, Jefe de Proyecto (sensible)
-- ----------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['proveedores', 'facturas', 'detalle_factura'] loop
    execute format('alter table %I enable row level security;', t);
    execute format('drop policy if exists "rol_%1$s" on %1$I;', t);
    execute format(
      'create policy "rol_%1$s" on %1$I for all to authenticated '
      || 'using (public.mi_rol() = any (array[''Administrador'',''Jefe de Proyecto'',''Adquisiciones''])) '
      || 'with check (public.mi_rol() = any (array[''Administrador'',''Jefe de Proyecto'',''Adquisiciones'']));',
      t
    );
  end loop;

  execute 'alter table subcontratos enable row level security';
  execute 'drop policy if exists "rol_subcontratos" on subcontratos';
  execute 'create policy "rol_subcontratos" on subcontratos for all to authenticated '
       || 'using (public.mi_rol() = any (array[''Administrador'',''Jefe de Proyecto''])) '
       || 'with check (public.mi_rol() = any (array[''Administrador'',''Jefe de Proyecto'']))';
end $$;

-- Permitir invocar las funciones desde la app (la propia función valida el rol)
grant execute on function public.fn_crear_subcontrato(uuid, uuid, text, numeric, boolean) to authenticated;
grant execute on function public.fn_finalizar_subcontrato(uuid) to authenticated;
grant execute on function public.fn_crear_factura(text, uuid, uuid, uuid, date, numeric, jsonb) to authenticated;
grant execute on function public.fn_aprobar_factura(uuid, boolean) to authenticated;
grant execute on function public.fn_pagar_factura(uuid) to authenticated;
grant execute on function public.fn_comparar_precios(text) to authenticated;
grant execute on function public.fn_estado_presupuesto(uuid) to authenticated;

-- ============================================================================
--  FIN — Finanzas, Abastecimiento y Subcontratos
-- ============================================================================
