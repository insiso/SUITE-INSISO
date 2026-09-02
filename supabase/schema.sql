-- ============================================================================
--  ERP FAPAMA Ing y Construcción SpA
--  Esquema de Base de Datos PostgreSQL para Supabase
--  Inspirado en SAP (MM / PS) e iConstruye
--
--  Cómo aplicarlo:
--    Supabase Dashboard > SQL Editor > New query > pegar este archivo > Run
--
--  Este script es IDEMPOTENTE: puede ejecutarse varias veces sin error.
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

-- ============================================================================
--  SEGURIDAD: Row Level Security
--  NOTA: Las políticas siguientes son PERMISIVAS para desarrollo (acceso con
--  la clave anon). En producción reemplázalas por políticas basadas en
--  auth.uid() y el rol del usuario.
-- ============================================================================
do $$
declare t text;
begin
  foreach t in array array[
    'usuarios','proyectos','presupuestos','materiales','bodegas',
    'inventario_stock','movimientos_kardex','herramientas',
    'prestamos_herramientas','gastos'
  ] loop
    execute format('alter table %I enable row level security;', t);
    execute format('drop policy if exists "acceso_dev_%1$s" on %1$I;', t);
    execute format(
      'create policy "acceso_dev_%1$s" on %1$I for all to anon, authenticated using (true) with check (true);',
      t
    );
  end loop;
end $$;

-- ============================================================================
--  DATOS DE EJEMPLO (Seed) — opcional, para ver el sistema con datos
-- ============================================================================

-- Usuarios -----------------------------------------------------------------
insert into usuarios (nombre, email, rol) values
  ('Ignacio Valenzuela', 'ignacioisraelvg@gmail.com', 'Administrador'),
  ('María González',     'maria.gonzalez@fapama.cl',  'Jefe de Proyecto'),
  ('Pedro Soto',         'pedro.soto@fapama.cl',      'Bodeguero')
on conflict (email) do nothing;

-- Proyectos ----------------------------------------------------------------
insert into proyectos (codigo, nombre, ubicacion, descripcion, fecha_inicio, fecha_termino, presupuesto_total, estado, responsable_id)
values
  ('PRY-001', 'Edificio Mirador Norte', 'Antofagasta, Región de Antofagasta', 'Edificio habitacional de 12 pisos', '2026-01-15', '2026-12-20', 850000000, 'Activo',
    (select id from usuarios where email='maria.gonzalez@fapama.cl')),
  ('PRY-002', 'Planta Industrial Sur', 'Concepción, Región del Biobío', 'Nave industrial y oficinas', '2026-03-01', '2026-10-30', 420000000, 'Activo',
    (select id from usuarios where email='maria.gonzalez@fapama.cl')),
  ('PRY-003', 'Remodelación Hospital Central', 'Santiago, Región Metropolitana', 'Ampliación ala de urgencias', '2026-06-01', '2027-02-28', 1200000000, 'Planificación', null)
on conflict (codigo) do nothing;

-- Presupuestos (desglose por categoría) ------------------------------------
insert into presupuestos (proyecto_id, categoria, descripcion, monto_asignado)
select p.id, v.categoria::categoria_presupuesto, v.descripcion, v.monto
from (values
  ('PRY-001', 'Materiales',   'Hormigón, fierro, áridos',        380000000),
  ('PRY-001', 'Mano de Obra', 'Cuadrillas y maestros',           260000000),
  ('PRY-001', 'Herramientas', 'Arriendo y herramientas menores',  60000000),
  ('PRY-001', 'Equipos',      'Grúa y maquinaria',               150000000),
  ('PRY-002', 'Materiales',   'Estructura metálica y cubierta',  210000000),
  ('PRY-002', 'Mano de Obra', 'Montaje y terminaciones',         140000000),
  ('PRY-002', 'Equipos',      'Maquinaria de montaje',            70000000)
) as v(codigo, categoria, descripcion, monto)
join proyectos p on p.codigo = v.codigo
where not exists (
  select 1 from presupuestos x where x.proyecto_id = p.id and x.categoria = v.categoria::categoria_presupuesto and x.descripcion = v.descripcion
);

-- Materiales ---------------------------------------------------------------
insert into materiales (sku, descripcion, categoria, unidad_medida, precio_unitario, stock_minimo) values
  ('MAT-0001', 'Cemento Portland 25kg',           'Cementos',    'sc',  4990,    50),
  ('MAT-0002', 'Fierro estriado 12mm x 6m',        'Acero',       'un',  8990,    100),
  ('MAT-0003', 'Arena gruesa',                      'Áridos',      'm3',  18000,   10),
  ('MAT-0004', 'Gravilla',                          'Áridos',      'm3',  21000,   10),
  ('MAT-0005', 'Tablero terciado 18mm',             'Maderas',     'un',  24990,   30),
  ('MAT-0006', 'Tubo PVC 110mm x 6m',               'Sanitario',   'un',  12500,   40),
  ('MAT-0007', 'Pintura látex blanco 1 galón',      'Pinturas',    'gl',  19990,   20),
  ('MAT-0008', 'Perfil metálico 100x50x2mm x 6m',   'Acero',       'un',  29900,   25)
on conflict (sku) do nothing;

-- Bodegas ------------------------------------------------------------------
insert into bodegas (codigo, nombre, tipo, ubicacion, proyecto_id)
values
  ('BOD-CEN', 'Bodega Central',        'Central',  'Av. Industrial 1234, Santiago', null),
  ('BOD-P01', 'Bodega Obra Mirador',   'Proyecto', 'Faena Antofagasta', (select id from proyectos where codigo='PRY-001')),
  ('BOD-P02', 'Bodega Planta Sur',     'Proyecto', 'Faena Concepción',  (select id from proyectos where codigo='PRY-002'))
on conflict (codigo) do nothing;

-- Stock inicial (vía movimientos de ENTRADA para respetar el Kardex) -------
do $$
declare
  v_bod_cen uuid := (select id from bodegas where codigo='BOD-CEN');
  v_usr     uuid := (select id from usuarios where rol='Bodeguero' limit 1);
  r record;
begin
  -- Solo sembrar si aún no hay movimientos
  if (select count(*) from movimientos_kardex) = 0 then
    for r in select id, precio_unitario from materiales loop
      insert into movimientos_kardex (tipo, material_id, cantidad, costo_unitario, bodega_destino_id, usuario_id, concepto)
      values ('ENTRADA', r.id, 200, r.precio_unitario, v_bod_cen, v_usr, 'Carga inicial de inventario');
    end loop;
  end if;
end $$;

-- Consumo de ejemplo imputado a un proyecto (genera gasto real materiales) --
do $$
declare
  v_bod_cen uuid := (select id from bodegas where codigo='BOD-CEN');
  v_pry uuid := (select id from proyectos where codigo='PRY-001');
  v_mat uuid := (select id from materiales where sku='MAT-0001');
  v_precio numeric := (select precio_unitario from materiales where sku='MAT-0001');
begin
  if (select count(*) from movimientos_kardex where tipo='SALIDA') = 0 then
    insert into movimientos_kardex (tipo, material_id, cantidad, costo_unitario, bodega_origen_id, proyecto_id, concepto)
    values ('SALIDA', v_mat, 40, v_precio, v_bod_cen, v_pry, 'Consumo en fundaciones');
  end if;
end $$;

-- Herramientas -------------------------------------------------------------
insert into herramientas (codigo, nombre, descripcion, categoria, estado, valor, bodega_id)
values
  ('HER-001', 'Taladro percutor Bosch GSB 13', 'Taladro 650W', 'Eléctricas', 'DISPONIBLE', 89990, (select id from bodegas where codigo='BOD-CEN')),
  ('HER-002', 'Esmeril angular 4.5"',          'Makita 720W',  'Eléctricas', 'DISPONIBLE', 54990, (select id from bodegas where codigo='BOD-CEN')),
  ('HER-003', 'Generador eléctrico 3kVA',      'Honda',        'Equipos',    'MANTENCION', 450000, (select id from bodegas where codigo='BOD-CEN')),
  ('HER-004', 'Nivel láser autonivelante',     'Dewalt',       'Medición',   'DISPONIBLE', 220000, (select id from bodegas where codigo='BOD-P01'))
on conflict (codigo) do nothing;

-- Préstamo de ejemplo ------------------------------------------------------
do $$
declare
  v_her uuid := (select id from herramientas where codigo='HER-002');
  v_pry uuid := (select id from proyectos where codigo='PRY-001');
begin
  if (select count(*) from prestamos_herramientas) = 0 then
    insert into prestamos_herramientas (herramienta_id, proyecto_id, responsable_nombre, observaciones)
    values (v_her, v_pry, 'Juan Pérez (Maestro)', 'Entregado para trabajos de terminación');
  end if;
end $$;

-- Gastos de ejemplo (mano de obra) -----------------------------------------
insert into gastos (proyecto_id, categoria, descripcion, monto, fecha)
select p.id, 'Mano de Obra'::categoria_presupuesto, 'Avance planilla quincena 1', 32000000, current_date - 10
from proyectos p where p.codigo='PRY-001'
and not exists (select 1 from gastos g where g.proyecto_id = p.id and g.descripcion = 'Avance planilla quincena 1');

-- ============================================================================
--  FIN DEL ESQUEMA
-- ============================================================================
