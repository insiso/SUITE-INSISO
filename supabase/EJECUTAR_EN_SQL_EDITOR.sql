-- SUITE INSISO — SCRIPT FINAL DE INSTALACIÓN (v4: fix choque de nombres presupuestos)
-- Pegar COMPLETO en Supabase > SQL Editor > Run. Es idempotente (re-ejecutable).
-- v2: agrega la tabla movimientos_herramientas que faltaba para los parches.

-- ===== FIX Security Advisor: las vistas del ERP respetan la seguridad del usuario que consulta =====
alter view public.vista_inventario set (security_invoker = true);
alter view public.vista_stock_total set (security_invoker = true);
alter view public.vista_gasto_real set (security_invoker = true);
alter view public.vista_desviacion_presupuesto set (security_invoker = true);
alter view public.vista_resumen_proyectos set (security_invoker = true);

-- ===== 1/5: Enlace login-perfil y seguridad del ERP base =====
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
alter table usuarios enable row level security;
drop policy if exists "acceso_dev_usuarios" on usuarios;
drop policy if exists "acceso_auth_usuarios" on usuarios;
drop policy if exists "lectura_usuarios" on usuarios;
create policy "lectura_usuarios" on usuarios
  for select to authenticated using (true);

-- ===== 2/5: Abastecimiento: proveedores, subcontratos, facturas =====
create or replace function public.mi_rol()
returns text language sql stable security definer set search_path = public as $$
  select rol::text from public.usuarios where auth_user_id = auth.uid() limit 1;
$$;
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
do $$ begin
  create type estado_subcontrato as enum ('Vigente', 'Finalizado', 'Anulado');
exception when duplicate_object then null; end $$;
do $$ begin
  create type estado_factura as enum ('Pendiente', 'Aprobada', 'Pagada', 'Anulada');
exception when duplicate_object then null; end $$;
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
create table if not exists facturas (
  id              uuid primary key default gen_random_uuid(),
  numero_factura  text not null,
  proveedor_id    uuid not null references proveedores(id) on delete restrict,
  proyecto_id     uuid not null references proyectos(id) on delete cascade,
  subcontrato_id  uuid references subcontratos(id) on delete set null,   
  monto_total     numeric(16,2) not null default 0 check (monto_total >= 0),
  fecha           date not null default current_date,
  estado          estado_factura not null default 'Pendiente',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (proveedor_id, numero_factura)                                   
);
drop trigger if exists trg_facturas_updated on facturas;
create trigger trg_facturas_updated before update on facturas
  for each row execute function fn_set_updated_at();
create index if not exists idx_facturas_proyecto on facturas(proyecto_id);
create index if not exists idx_facturas_subcontrato on facturas(subcontrato_id);
create index if not exists idx_facturas_proveedor on facturas(proveedor_id);
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
grant execute on function public.fn_crear_subcontrato(uuid, uuid, text, numeric, boolean) to authenticated;
grant execute on function public.fn_finalizar_subcontrato(uuid) to authenticated;
grant execute on function public.fn_crear_factura(text, uuid, uuid, uuid, date, numeric, jsonb) to authenticated;
grant execute on function public.fn_aprobar_factura(uuid, boolean) to authenticated;
grant execute on function public.fn_pagar_factura(uuid) to authenticated;
grant execute on function public.fn_comparar_precios(text) to authenticated;
grant execute on function public.fn_estado_presupuesto(uuid) to authenticated;

-- ===== 3/5: Parches del ERP (consumo, herramientas, auditoría) =====

-- ===== FIX: tabla de movimientos de herramientas (existía en Fapama fuera del instalador) =====
create table if not exists public.movimientos_herramientas (
  id                uuid primary key default gen_random_uuid(),
  herramienta_id    uuid not null references public.herramientas(id) on delete cascade,
  bodega_origen_id  uuid references public.bodegas(id) on delete set null,
  bodega_destino_id uuid references public.bodegas(id) on delete set null,
  usuario_id        uuid references public.usuarios(id) on delete set null,
  concepto          text,
  fecha             timestamptz not null default now(),
  created_at        timestamptz not null default now()
);
comment on table public.movimientos_herramientas is 'Historial de traslados de herramientas entre bodegas. Reconstruida para la Suite; ajustar si el frontend requiere más columnas.';
alter table public.movimientos_herramientas enable row level security;
drop policy if exists movimientos_herramientas_auth on public.movimientos_herramientas;
create policy movimientos_herramientas_auth on public.movimientos_herramientas
  for all to authenticated using (true) with check (true);
create index if not exists idx_mov_herr_herramienta on public.movimientos_herramientas(herramienta_id);

create table if not exists public.bodega_proyectos (
  bodega_id   uuid not null references public.bodegas(id)   on delete cascade,
  proyecto_id uuid not null references public.proyectos(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (bodega_id, proyecto_id)
);
comment on table public.bodega_proyectos is
  'Proyectos que pueden usar una bodega. Permite que una bodega central sirva a varios proyectos.';
alter table public.bodega_proyectos enable row level security;
drop policy if exists bodega_proyectos_auth on public.bodega_proyectos;
create policy bodega_proyectos_auth on public.bodega_proyectos
  for all to authenticated using (true) with check (true);
create index if not exists idx_bodega_proyectos_proyecto
  on public.bodega_proyectos (proyecto_id);
alter table public.herramientas
  add column if not exists por_cantidad boolean not null default false;
alter table public.herramientas
  add column if not exists cantidad integer not null default 1;
alter table public.movimientos_herramientas
  add column if not exists cantidad integer not null default 1;
create table if not exists public.herramienta_stock (
  herramienta_id uuid not null references public.herramientas(id) on delete cascade,
  bodega_id      uuid not null references public.bodegas(id)      on delete cascade,
  cantidad       integer not null default 0,
  primary key (herramienta_id, bodega_id)
);
comment on table public.herramienta_stock is
  'Unidades de una herramienta por bodega. Permite repartir (ej. 4 palas = 2 en Central + 2 en Obra).';
alter table public.herramienta_stock enable row level security;
drop policy if exists herramienta_stock_auth on public.herramienta_stock;
create policy herramienta_stock_auth on public.herramienta_stock
  for all to authenticated using (true) with check (true);
alter table public.proveedores add column if not exists direccion text;
alter table public.materiales
  add column if not exists segmento text not null default 'Construcción';
create or replace function public.mi_email() returns text
language sql stable security definer set search_path = public as $$
  select email from public.usuarios where auth_user_id = auth.uid() limit 1;
$$;
create table if not exists public.auditoria (
  id            uuid primary key default gen_random_uuid(),
  tabla         text not null,
  registro_id   text,
  accion        text not null,            
  usuario_email text,
  descripcion   text,                     
  fecha         timestamptz not null default now()
);
alter table public.auditoria enable row level security;
drop policy if exists auditoria_lectura on public.auditoria;
create policy auditoria_lectura on public.auditoria
  for select to authenticated using (public.mi_rol() = 'Administrador');
create index if not exists idx_auditoria_fecha on public.auditoria(fecha desc);
create index if not exists idx_auditoria_tabla on public.auditoria(tabla);
create or replace function public.fn_auditar() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_json jsonb;
  v_id   text;
  v_desc text;
begin
  if (tg_op = 'DELETE') then v_json := to_jsonb(old); else v_json := to_jsonb(new); end if;
  v_id := coalesce(v_json->>'id','');
  v_desc := coalesce(
    v_json->>'descripcion', v_json->>'nombre', v_json->>'razon_social',
    v_json->>'numero_factura', v_json->>'codigo', v_json->>'sku', v_id
  );
  begin
    insert into public.auditoria(tabla, registro_id, accion, usuario_email, descripcion)
    values (tg_table_name, v_id, tg_op, public.mi_email(), v_desc);
  exception when others then
    null; -- nunca bloquear la operación por un problema de auditoría
  end;
  if (tg_op = 'DELETE') then return old; else return new; end if;
end; $$;
do $$
declare t text;
begin
  foreach t in array array[
    'materiales','herramientas','proveedores','bodegas','facturas',
    'proyectos','presupuestos','gastos','usuarios','subcontratos','movimientos_kardex'
  ] loop
    execute format('drop trigger if exists trg_aud_%1$s on public.%1$I;', t);
    execute format('create trigger trg_aud_%1$s after insert or update or delete on public.%1$I for each row execute function public.fn_auditar();', t);
  end loop;
end $$;
alter table public.proveedores add column if not exists tipo_pago text;
create table if not exists public.evaluaciones_proveedor (
  id uuid primary key default gen_random_uuid(),
  proveedor_id uuid not null references public.proveedores(id) on delete cascade,
  periodo text,
  fecha date not null default current_date,
  entrega int not null default 0,
  calidad int not null default 0,
  precio int not null default 0,
  distancia int not null default 0,
  tipo_pago int not null default 0,
  promedio numeric(5,2) not null default 0,
  comentario text,
  usuario_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists idx_eval_prov on public.evaluaciones_proveedor(proveedor_id);
alter table public.evaluaciones_proveedor enable row level security;
drop policy if exists eval_prov_rw on public.evaluaciones_proveedor;
create policy eval_prov_rw on public.evaluaciones_proveedor
  for all to authenticated using (true) with check (true);

-- ===== 4/5: SUITE INSISO — base multiempresa =====
create table if not exists public.empresas (
  id              uuid primary key default gen_random_uuid(),
  nombre          text not null,
  rut             text unique,
  marca_nombre    text,                
  logo_url        text,
  color_primario  text default '#0A1628',
  plan            text not null default 'prueba'
                  check (plan in ('prueba','basico','pro','combo','contador')),
  modulos_activos text[] not null default array['finanzas'],  
  activo          boolean not null default true,
  created_at      timestamptz not null default now()
);
comment on table public.empresas is
  'Tenants de la Suite INSISO. Todo dato de negocio referencia empresas.id vía empresa_id.';
alter table if exists public.usuarios
  add column if not exists empresa_id uuid references public.empresas(id);
create index if not exists idx_usuarios_empresa on public.usuarios(empresa_id);
create or replace function public.mi_empresa()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select empresa_id from public.usuarios where id = auth.uid()
$$;
comment on function public.mi_empresa() is
  'Empresa del usuario autenticado. Base de todas las políticas RLS de la Suite.';
create or replace function public.aplicar_rls_empresa(p_tabla text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  execute format('alter table public.%I enable row level security', p_tabla);
  execute format('drop policy if exists %I on public.%I', p_tabla || '_empresa_scope', p_tabla);
  execute format(
    'create policy %I on public.%I for all to authenticated
       using (empresa_id = public.mi_empresa())
       with check (empresa_id = public.mi_empresa())',
    p_tabla || '_empresa_scope', p_tabla
  );
end;
$$;
alter table public.empresas enable row level security;
drop policy if exists empresas_propia on public.empresas;
create policy empresas_propia on public.empresas
  for select to authenticated
  using (id = public.mi_empresa());
insert into public.empresas (nombre, rut, marca_nombre, plan, modulos_activos)
select 'INSISO SpA', '78.469.358-9', 'INSISO', 'pro', array['logistica','finanzas']
where not exists (select 1 from public.empresas where rut = '78.469.358-9');

-- ===== 5/5: SUITE INSISO — módulo Finanzas =====
create table if not exists public.centros_costo (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references public.empresas(id),
  codigo      text not null,               
  nombre      text not null,
  activo      boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (empresa_id, codigo)
);
create table if not exists public.cuentas (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references public.empresas(id),
  codigo      text not null,               
  nombre      text not null,
  tipo        text not null check (tipo in ('activo','pasivo','patrimonio','ingreso','gasto')),
  imputable   boolean not null default false,  
  padre_id    uuid references public.cuentas(id),
  activo      boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (empresa_id, codigo)
);
create index if not exists idx_cuentas_empresa on public.cuentas(empresa_id);
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
  check (not (debe > 0 and haber > 0))   
);
create index if not exists idx_lineas_comp on public.lineas_comprobante(comprobante_id);
create index if not exists idx_lineas_cuenta on public.lineas_comprobante(empresa_id, cuenta_id);
create table if not exists public.documentos_rcv (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null references public.empresas(id),
  registro       text not null check (registro in ('venta','compra')),
  tipo_dte       int not null,              
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
create table if not exists public.presupuestos_finanzas (
  id              uuid primary key default gen_random_uuid(),
  empresa_id      uuid not null references public.empresas(id),
  anio            int not null,
  mes             int check (mes between 1 and 12),  
  cuenta_id       uuid references public.cuentas(id),
  centro_costo_id uuid references public.centros_costo(id),
  monto           numeric(15,0) not null default 0
);
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
alter view public.vista_libro_mayor set (security_invoker = true);
alter view public.vista_balance_comprobacion set (security_invoker = true);
select public.aplicar_rls_empresa(t) from unnest(array[
  'centros_costo','cuentas','periodos','comprobantes',
  'lineas_comprobante','documentos_rcv','presupuestos_finanzas'
]) as t;
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

-- Verificación final: debe listar ~27 tablas incluyendo empresas, cuentas, comprobantes
select table_name from information_schema.tables where table_schema='public' order by 1;