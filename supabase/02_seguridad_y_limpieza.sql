-- ============================================================================
--  ERP FAPAMA — Paso 2: Seguridad (autenticación) + Limpieza de datos demo
--  Ejecutar UNA vez en: Supabase Dashboard > SQL Editor > pegar > Run
--  Requisito: haber ejecutado antes schema.sql
--  Es idempotente (se puede correr de nuevo sin error).
-- ============================================================================

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
