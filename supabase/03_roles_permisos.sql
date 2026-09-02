-- ============================================================================
--  ERP FAPAMA — Paso 3: Permisos por ROL en la base de datos (RLS)
--  Ejecutar UNA vez en: Supabase Dashboard > SQL Editor > pegar > Run
--  Requisito: haber ejecutado antes instalacion_completa.sql
--  Es idempotente (se puede correr de nuevo sin error).
--
--  Reglas:
--   · Administrador / Jefe de Proyecto : acceso total (incluye proyectos,
--     presupuestos, gastos).
--   · Bodeguero / Adquisiciones        : tablas operativas (materiales, bodegas,
--     inventario, movimientos, herramientas). SIN proyectos/presupuestos/gastos.
--   · Visualizador                     : sin acceso a datos.
-- ============================================================================

-- Función: rol del usuario autenticado (SECURITY DEFINER evita recursión RLS)
create or replace function public.mi_rol()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select rol::text from public.usuarios where auth_user_id = auth.uid() limit 1;
$$;

-- ----------------------------------------------------------------------------
--  Políticas por rol
-- ----------------------------------------------------------------------------
do $$
declare t text;
begin
  -- Tablas OPERATIVAS: Administrador, Jefe de Proyecto, Bodeguero, Adquisiciones
  foreach t in array array[
    'materiales','bodegas','inventario_stock','movimientos_kardex',
    'herramientas','prestamos_herramientas'
  ] loop
    execute format('alter table %I enable row level security;', t);
    execute format('drop policy if exists "acceso_auth_%1$s" on %1$I;', t);
    execute format('drop policy if exists "rol_%1$s" on %1$I;', t);
    execute format(
      'create policy "rol_%1$s" on %1$I for all to authenticated '
      || 'using (public.mi_rol() = any (array[''Administrador'',''Jefe de Proyecto'',''Bodeguero'',''Adquisiciones''])) '
      || 'with check (public.mi_rol() = any (array[''Administrador'',''Jefe de Proyecto'',''Bodeguero'',''Adquisiciones'']));',
      t
    );
  end loop;

  -- Tablas SENSIBLES: solo Administrador, Jefe de Proyecto
  foreach t in array array['proyectos','presupuestos','gastos'] loop
    execute format('alter table %I enable row level security;', t);
    execute format('drop policy if exists "acceso_auth_%1$s" on %1$I;', t);
    execute format('drop policy if exists "rol_%1$s" on %1$I;', t);
    execute format(
      'create policy "rol_%1$s" on %1$I for all to authenticated '
      || 'using (public.mi_rol() = any (array[''Administrador'',''Jefe de Proyecto''])) '
      || 'with check (public.mi_rol() = any (array[''Administrador'',''Jefe de Proyecto'']));',
      t
    );
  end loop;
end $$;

-- usuarios: el Administrador ve todos; los demás solo su propia ficha
drop policy if exists "lectura_usuarios" on usuarios;
create policy "lectura_usuarios" on usuarios
  for select to authenticated
  using (public.mi_rol() = 'Administrador' or auth_user_id = auth.uid());

-- ----------------------------------------------------------------------------
--  Las VISTAS respetan los permisos del usuario que consulta (security_invoker)
--  Así, p.ej. un Bodeguero no puede leer datos de proyectos vía las vistas.
-- ----------------------------------------------------------------------------
alter view vista_inventario set (security_invoker = true);
alter view vista_stock_total set (security_invoker = true);
alter view vista_gasto_real set (security_invoker = true);
alter view vista_desviacion_presupuesto set (security_invoker = true);
alter view vista_resumen_proyectos set (security_invoker = true);

-- ============================================================================
--  FIN — Permisos por rol aplicados.
-- ============================================================================
