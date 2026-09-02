-- ============================================================================
--  ERP FAPAMA Ing y Construcción SpA
--  SCRIPT UNIFICADO DE INSTALACIÓN  (esquema + seguridad/login, SIN datos demo)
--
--  Ejecutar UNA vez en: Supabase Dashboard > SQL Editor > pegar TODO > Run
--  Es IDEMPOTENTE: puede correrse varias veces sin error.
--  Incluye: tablas, vistas, triggers, limpieza de datos de ejemplo,
--           enlace login <-> perfil y seguridad (RLS solo para autenticados).
-- ============================================================================

-- Extensiones --------------------------------------------------------------
create extension if not exists "pgcrypto";  -- para gen_random_uuid()

-- ============================================================================
--  TIPOS ENUMERADOS (Catálogos de dominio)
-- ============================================================================
do $$ begin
  create type rol_usuario as enum ('Administrador', 'Jefe de Proyecto', 'Bodeguero', 'Adquisiciones', 'Visualizador');
exception when duplicate_object then null; end $$;

do $$ begin
  create type estado_proyecto as enum ('Planificación', 'Activo', 'Suspendido', 'Cerrado');
exception when duplicate_object then null; end $$;

do $$ begin
  create type categoria_presupuesto as enum ('Materiales', 'Mano de Obra', 'Herramientas', 'Equipos', 'Subcontratos', 'Otros');
exception when duplicate_object then null; end $$;

do $$ begin
  create type tipo_bodega as enum ('Central', 'Proyecto', 'Virtual', 'Tránsito');
exception when duplicate_object then null; end $$;

do $$ begin
  create type tipo_movimiento as enum ('ENTRADA', 'SALIDA', 'TRASPASO', 'AJUSTE');
exception when duplicate_object then null; end $$;

do $$ begin
  create type estado_herramienta as enum ('DISPONIBLE', 'PRESTADA', 'MANTENCION', 'BAJA');
exception when duplicate_object then null; end $$;

do $$ begin
  create type estado_prestamo as enum ('PRESTADA', 'DEVUELTA');
exception when duplicate_object then null; end $$;

-- ============================================================================
--  FUNCIÓN GENÉRICA DE AUDITORÍA (actualiza updated_at)
-- ============================================================================
create or replace function fn_set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ============================================================================
--  1. USUARIOS
--     Perfil interno del ERP. Opcionalmente enlazable a Supabase Auth.
-- ============================================================================
create table if not exists usuarios (
  id              uuid primary key default gen_random_uuid(),
  auth_user_id    uuid unique,                       -- enlace opcional a auth.users
  nombre          text not null,
  email           text not null unique,
  rol             rol_usuario not null default 'Visualizador',
  telefono        text,
  activo          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

drop trigger if exists trg_usuarios_updated on usuarios;
create trigger trg_usuarios_updated before update on usuarios
  for each row execute function fn_set_updated_at();

-- ============================================================================
--  2. PROYECTOS  (SAP PS)
-- ============================================================================
create table if not exists proyectos (
  id                uuid primary key default gen_random_uuid(),
  codigo            text not null unique,
  nombre            text not null,
  ubicacion         text,
  descripcion       text,
  fecha_inicio      date,
  fecha_termino     date,
  presupuesto_total numeric(16,2) not null default 0 check (presupuesto_total >= 0),
  estado            estado_proyecto not null default 'Planificación',
  responsable_id    uuid references usuarios(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint chk_fechas_proyecto check (fecha_termino is null or fecha_inicio is null or fecha_termino >= fecha_inicio)
);

drop trigger if exists trg_proyectos_updated on proyectos;
create trigger trg_proyectos_updated before update on proyectos
  for each row execute function fn_set_updated_at();

create index if not exists idx_proyectos_estado on proyectos(estado);

-- ============================================================================
--  3. PRESUPUESTOS  (Desglose del presupuesto por categoría / ítem)
-- ============================================================================
create table if not exists presupuestos (
  id              uuid primary key default gen_random_uuid(),
  proyecto_id     uuid not null references proyectos(id) on delete cascade,
  categoria       categoria_presupuesto not null,
  descripcion     text,
  monto_asignado  numeric(16,2) not null default 0 check (monto_asignado >= 0),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

drop trigger if exists trg_presupuestos_updated on presupuestos;
create trigger trg_presupuestos_updated before update on presupuestos
  for each row execute function fn_set_updated_at();

create index if not exists idx_presupuestos_proyecto on presupuestos(proyecto_id);

-- ============================================================================
--  4. MATERIALES  (Catálogo Maestro - SAP MM)
-- ============================================================================
create table if not exists materiales (
  id              uuid primary key default gen_random_uuid(),
  sku             text not null unique,
  descripcion     text not null,
  categoria       text,
  unidad_medida   text not null default 'un',        -- m3, kg, un, ml, etc.
  precio_unitario numeric(16,2) not null default 0 check (precio_unitario >= 0),
  stock_minimo    numeric(16,3) not null default 0 check (stock_minimo >= 0),
  activo          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

drop trigger if exists trg_materiales_updated on materiales;
create trigger trg_materiales_updated before update on materiales
  for each row execute function fn_set_updated_at();

-- ============================================================================
--  5. BODEGAS  (Multi-bodega - SAP MM)
-- ============================================================================
create table if not exists bodegas (
  id            uuid primary key default gen_random_uuid(),
  codigo        text not null unique,
  nombre        text not null,
  tipo          tipo_bodega not null default 'Central',
  ubicacion     text,
  proyecto_id   uuid references proyectos(id) on delete set null,  -- bodega de obra
  activo        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

drop trigger if exists trg_bodegas_updated on bodegas;
create trigger trg_bodegas_updated before update on bodegas
  for each row execute function fn_set_updated_at();

-- ============================================================================
--  6. INVENTARIO_STOCK  (Matriz de stock por bodega)
-- ============================================================================
create table if not exists inventario_stock (
  id            uuid primary key default gen_random_uuid(),
  material_id   uuid not null references materiales(id) on delete cascade,
  bodega_id     uuid not null references bodegas(id) on delete cascade,
  cantidad      numeric(16,3) not null default 0,
  updated_at    timestamptz not null default now(),
  unique (material_id, bodega_id)
);

drop trigger if exists trg_inventario_updated on inventario_stock;
create trigger trg_inventario_updated before update on inventario_stock
  for each row execute function fn_set_updated_at();

create index if not exists idx_inventario_material on inventario_stock(material_id);
create index if not exists idx_inventario_bodega on inventario_stock(bodega_id);

-- ============================================================================
--  7. MOVIMIENTOS_KARDEX  (Transacciones estrictas de inventario)
-- ============================================================================
create sequence if not exists seq_folio_movimiento start 1000;

create table if not exists movimientos_kardex (
  id                uuid primary key default gen_random_uuid(),
  folio             bigint not null default nextval('seq_folio_movimiento'),
  tipo              tipo_movimiento not null,
  material_id       uuid not null references materiales(id) on delete restrict,
  cantidad          numeric(16,3) not null check (cantidad > 0),
  costo_unitario    numeric(16,2) not null default 0,   -- snapshot del costo al momento
  bodega_origen_id  uuid references bodegas(id) on delete restrict,
  bodega_destino_id uuid references bodegas(id) on delete restrict,
  proyecto_id       uuid references proyectos(id) on delete set null,
  usuario_id        uuid references usuarios(id) on delete set null,
  concepto          text,
  fecha             timestamptz not null default now(),
  created_at        timestamptz not null default now(),
  -- Reglas de integridad por tipo de movimiento
  constraint chk_mov_entrada check (tipo <> 'ENTRADA' or bodega_destino_id is not null),
  constraint chk_mov_salida  check (tipo <> 'SALIDA'  or bodega_origen_id is not null),
  constraint chk_mov_traspaso check (
    tipo <> 'TRASPASO' or (bodega_origen_id is not null and bodega_destino_id is not null and bodega_origen_id <> bodega_destino_id)
  )
);

create index if not exists idx_kardex_material on movimientos_kardex(material_id);
create index if not exists idx_kardex_fecha on movimientos_kardex(fecha desc);
create index if not exists idx_kardex_proyecto on movimientos_kardex(proyecto_id);
create index if not exists idx_kardex_tipo on movimientos_kardex(tipo);

-- ----------------------------------------------------------------------------
--  TRIGGER: aplica el movimiento al stock automáticamente (upsert atómico)
-- ----------------------------------------------------------------------------
create or replace function fn_aplicar_movimiento()
returns trigger as $$
begin
  -- Suma al destino  (ENTRADA, TRASPASO, AJUSTE con destino)
  if new.bodega_destino_id is not null and new.tipo in ('ENTRADA', 'TRASPASO', 'AJUSTE') then
    insert into inventario_stock (material_id, bodega_id, cantidad)
    values (new.material_id, new.bodega_destino_id, new.cantidad)
    on conflict (material_id, bodega_id)
    do update set cantidad = inventario_stock.cantidad + new.cantidad,
                  updated_at = now();
  end if;

  -- Descuenta del origen  (SALIDA, TRASPASO, AJUSTE con origen)
  if new.bodega_origen_id is not null and new.tipo in ('SALIDA', 'TRASPASO', 'AJUSTE') then
    insert into inventario_stock (material_id, bodega_id, cantidad)
    values (new.material_id, new.bodega_origen_id, -new.cantidad)
    on conflict (material_id, bodega_id)
    do update set cantidad = inventario_stock.cantidad - new.cantidad,
                  updated_at = now();
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_aplicar_movimiento on movimientos_kardex;
create trigger trg_aplicar_movimiento after insert on movimientos_kardex
  for each row execute function fn_aplicar_movimiento();

-- ============================================================================
--  8. HERRAMIENTAS  (Activos reutilizables con seguimiento de estado)
-- ============================================================================
create table if not exists herramientas (
  id            uuid primary key default gen_random_uuid(),
  codigo        text not null unique,
  nombre        text not null,
  descripcion   text,
  categoria     text,
  estado        estado_herramienta not null default 'DISPONIBLE',
  bodega_id     uuid references bodegas(id) on delete set null,
  valor         numeric(16,2) not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

drop trigger if exists trg_herramientas_updated on herramientas;
create trigger trg_herramientas_updated before update on herramientas
  for each row execute function fn_set_updated_at();

-- ============================================================================
--  9. PRESTAMOS_HERRAMIENTAS  (Flujo de Préstamo / Devolución - checkout/checkin)
-- ============================================================================
create table if not exists prestamos_herramientas (
  id                  uuid primary key default gen_random_uuid(),
  herramienta_id      uuid not null references herramientas(id) on delete cascade,
  usuario_id          uuid references usuarios(id) on delete set null,
  proyecto_id         uuid references proyectos(id) on delete set null,
  responsable_nombre  text not null,                 -- trabajador que recibe
  fecha_entrega       timestamptz not null default now(),
  fecha_devolucion    timestamptz,
  estado              estado_prestamo not null default 'PRESTADA',
  observaciones       text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

drop trigger if exists trg_prestamos_updated on prestamos_herramientas;
create trigger trg_prestamos_updated before update on prestamos_herramientas
  for each row execute function fn_set_updated_at();

create index if not exists idx_prestamos_herramienta on prestamos_herramientas(herramienta_id);
create index if not exists idx_prestamos_estado on prestamos_herramientas(estado);

-- ----------------------------------------------------------------------------
--  TRIGGER: sincroniza el estado de la herramienta con sus préstamos
-- ----------------------------------------------------------------------------
create or replace function fn_sync_estado_herramienta()
returns trigger as $$
begin
  if (tg_op = 'INSERT') then
    update herramientas set estado = 'PRESTADA', updated_at = now()
      where id = new.herramienta_id and estado <> 'BAJA';
  elsif (tg_op = 'UPDATE') then
    -- Al registrar la devolución, la herramienta vuelve a estar disponible
    if new.estado = 'DEVUELTA' and old.estado = 'PRESTADA' then
      update herramientas set estado = 'DISPONIBLE', updated_at = now()
        where id = new.herramienta_id and estado = 'PRESTADA';
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_sync_estado_herramienta on prestamos_herramientas;
create trigger trg_sync_estado_herramienta after insert or update on prestamos_herramientas
  for each row execute function fn_sync_estado_herramienta();

-- ============================================================================
--  10. GASTOS  (Gasto real comprometido por categoría - alimenta desviaciones)
-- ============================================================================
create table if not exists gastos (
  id             uuid primary key default gen_random_uuid(),
  proyecto_id    uuid not null references proyectos(id) on delete cascade,
  presupuesto_id uuid references presupuestos(id) on delete set null,
  categoria      categoria_presupuesto not null,
  descripcion    text,
  monto          numeric(16,2) not null check (monto >= 0),
  fecha          date not null default current_date,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

drop trigger if exists trg_gastos_updated on gastos;
create trigger trg_gastos_updated before update on gastos
  for each row execute function fn_set_updated_at();

create index if not exists idx_gastos_proyecto on gastos(proyecto_id);

-- ============================================================================
--  VISTAS DE ANALÍTICA (para Dashboard y módulos)
-- ============================================================================

-- Stock consolidado con alerta de stock bajo ------------------------------
create or replace view vista_inventario as
select
  s.id,
  s.material_id,
  m.sku,
  m.descripcion as material,
  m.categoria,
  m.unidad_medida,
  m.precio_unitario,
  m.stock_minimo,
  s.bodega_id,
  b.codigo as bodega_codigo,
  b.nombre as bodega,
  s.cantidad,
  (s.cantidad * m.precio_unitario) as valor_total,
  (s.cantidad <= m.stock_minimo) as alerta_stock_bajo,
  s.updated_at
from inventario_stock s
join materiales m on m.id = s.material_id
join bodegas b on b.id = s.bodega_id;

-- Stock total por material (sumando todas las bodegas) --------------------
create or replace view vista_stock_total as
select
  m.id as material_id,
  m.sku,
  m.descripcion as material,
  m.unidad_medida,
  m.stock_minimo,
  m.precio_unitario,
  coalesce(sum(s.cantidad), 0) as stock_total,
  coalesce(sum(s.cantidad * m.precio_unitario), 0) as valor_total,
  (coalesce(sum(s.cantidad), 0) <= m.stock_minimo) as alerta_stock_bajo
from materiales m
left join inventario_stock s on s.material_id = m.id
where m.activo = true
group by m.id;

-- Gasto real consolidado por proyecto y categoría -------------------------
--   = gastos manuales (mano de obra, etc.) + consumo de materiales valorizado
create or replace view vista_gasto_real as
select proyecto_id, categoria, sum(monto) as gasto_real
from (
  -- gastos manuales registrados
  select proyecto_id, categoria, monto
  from gastos
  union all
  -- consumo de materiales (SALIDAS imputadas a un proyecto)
  select k.proyecto_id, 'Materiales'::categoria_presupuesto as categoria,
         (k.cantidad * k.costo_unitario) as monto
  from movimientos_kardex k
  where k.tipo = 'SALIDA' and k.proyecto_id is not null
) t
group by proyecto_id, categoria;

-- Desviación presupuestaria por proyecto y categoría ----------------------
create or replace view vista_desviacion_presupuesto as
select
  p.proyecto_id,
  p.categoria,
  sum(p.monto_asignado) as asignado,
  coalesce(g.gasto_real, 0) as gastado,
  (sum(p.monto_asignado) - coalesce(g.gasto_real, 0)) as saldo
from presupuestos p
left join vista_gasto_real g on g.proyecto_id = p.proyecto_id and g.categoria = p.categoria
group by p.proyecto_id, p.categoria, g.gasto_real;

-- Resumen ejecutivo por proyecto (para tabla del Dashboard) ---------------
create or replace view vista_resumen_proyectos as
select
  pr.id,
  pr.codigo,
  pr.nombre,
  pr.estado,
  pr.ubicacion,
  pr.fecha_inicio,
  pr.fecha_termino,
  pr.presupuesto_total,
  coalesce(gr.gasto_total, 0) as gasto_real,
  (pr.presupuesto_total - coalesce(gr.gasto_total, 0)) as saldo,
  case when pr.presupuesto_total > 0
       then round((coalesce(gr.gasto_total, 0) / pr.presupuesto_total) * 100, 1)
       else 0 end as porcentaje_ejecucion
from proyectos pr
left join (
  select proyecto_id, sum(gasto_real) as gasto_total
  from vista_gasto_real group by proyecto_id
) gr on gr.proyecto_id = pr.id;


-- ----------------------------------------------------------------------------
--  A) LIMPIAR DATOS DE EJEMPLO  (deja la base lista para datos reales)
--     Orden respetando las llaves foráneas (hijos antes que padres).
-- ----------------------------------------------------------------------------
delete from movimientos_kardex;
delete from prestamos_herramientas;
delete from gastos;
delete from presupuestos;
delete from inventario_stock;
delete from herramientas;
delete from bodegas;
delete from materiales;
delete from proyectos;
delete from usuarios;                       -- perfiles demo (no enlazados a login)
alter sequence if exists seq_folio_movimiento restart with 1000;

-- ----------------------------------------------------------------------------
--  B) ENLACE AUTOMÁTICO LOGIN ⇄ PERFIL
--     Cada vez que se crea una cuenta (en Auth), se genera su fila en `usuarios`.
--     - El PRIMER usuario (o el correo del dueño) queda como Administrador.
--     - El resto toma el rol que indique el administrador al crearlo.
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nombre text;
  v_rol    text;
begin
  v_nombre := coalesce(nullif(new.raw_user_meta_data->>'nombre', ''), split_part(new.email, '@', 1));
  v_rol    := nullif(new.raw_user_meta_data->>'rol', '');

  if v_rol is null then
    if new.email = 'ignacioisraelvg@gmail.com'
       or (select count(*) from public.usuarios) = 0 then
      v_rol := 'Administrador';
    else
      v_rol := 'Visualizador';
    end if;
  end if;

  insert into public.usuarios (auth_user_id, email, nombre, rol)
  values (new.id, new.email, v_nombre, v_rol::rol_usuario)
  on conflict (email) do update
    set auth_user_id = excluded.auth_user_id,
        nombre       = excluded.nombre,
        rol          = excluded.rol;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
--  C) SEGURIDAD (RLS): solo usuarios autenticados
--     Reemplaza las políticas permisivas de desarrollo (anon) por políticas
--     que exigen sesión iniciada. La tabla `usuarios` queda de SOLO LECTURA
--     para usuarios normales (la gestión pasa por el servidor con service_role),
--     evitando que alguien se auto-asigne rol de Administrador.
-- ----------------------------------------------------------------------------

-- Tablas operativas: acceso completo para autenticados
do $$
declare t text;
begin
  foreach t in array array[
    'proyectos','presupuestos','materiales','bodegas',
    'inventario_stock','movimientos_kardex','herramientas',
    'prestamos_herramientas','gastos'
  ] loop
    execute format('alter table %I enable row level security;', t);
    execute format('drop policy if exists "acceso_dev_%1$s" on %1$I;', t);
    execute format('drop policy if exists "acceso_auth_%1$s" on %1$I;', t);
    execute format(
      'create policy "acceso_auth_%1$s" on %1$I for all to authenticated using (true) with check (true);',
      t
    );
  end loop;
end $$;

-- Tabla usuarios: SOLO LECTURA para autenticados (escritura solo vía service_role)
alter table usuarios enable row level security;
drop policy if exists "acceso_dev_usuarios" on usuarios;
drop policy if exists "acceso_auth_usuarios" on usuarios;
drop policy if exists "lectura_usuarios" on usuarios;
create policy "lectura_usuarios" on usuarios
  for select to authenticated using (true);

-- ============================================================================
--  FIN — Ahora crea tu primer usuario (Authentication > Users > Add user)
--  o desde la app una vez que entres como Administrador.
-- ============================================================================
