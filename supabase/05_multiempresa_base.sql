-- ============================================================================
-- SUITE INSISO · 05_multiempresa_base.sql
-- Base multiempresa (multi-tenant) de la Suite: tabla empresas, mi_empresa()
-- y helper para aplicar RLS por empresa a cualquier tabla.
-- Ejecutar en el Supabase NUEVO del producto (no el de Fapama).
-- Idempotente: puede ejecutarse más de una vez.
-- ============================================================================

-- 1) La tabla de tenants: cada fila es una empresa cliente de la Suite -------
create table if not exists public.empresas (
  id              uuid primary key default gen_random_uuid(),
  nombre          text not null,
  rut             text unique,
  marca_nombre    text,                -- nombre que ve el usuario en el header
  logo_url        text,
  color_primario  text default '#0A1628',
  plan            text not null default 'prueba'
                  check (plan in ('prueba','basico','pro','combo','contador')),
  modulos_activos text[] not null default array['finanzas'],  -- 'logistica','finanzas','personas'
  activo          boolean not null default true,
  created_at      timestamptz not null default now()
);

comment on table public.empresas is
  'Tenants de la Suite INSISO. Todo dato de negocio referencia empresas.id vía empresa_id.';

-- 2) Vincular usuarios a su empresa ------------------------------------------
-- (la tabla usuarios ya existe en el esquema base del fork)
alter table if exists public.usuarios
  add column if not exists empresa_id uuid references public.empresas(id);

create index if not exists idx_usuarios_empresa on public.usuarios(empresa_id);

-- 3) mi_empresa(): la función que sostiene TODO el aislamiento ---------------
-- SECURITY DEFINER para poder leer usuarios sin chocar con la RLS de usuarios.
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

-- 4) Helper: aplicar el aislamiento estándar a una tabla ---------------------
-- Uso:  select aplicar_rls_empresa('cuentas');
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

-- 5) RLS de las tablas base ---------------------------------------------------
-- empresas: cada usuario ve SOLO su propia empresa (el super-admin de INSISO
-- opera con service_role desde el backend, que salta RLS por diseño).
alter table public.empresas enable row level security;
drop policy if exists empresas_propia on public.empresas;
create policy empresas_propia on public.empresas
  for select to authenticated
  using (id = public.mi_empresa());

-- 6) Empresa semilla para desarrollo -----------------------------------------
insert into public.empresas (nombre, rut, marca_nombre, plan, modulos_activos)
select 'INSISO SpA', '78.469.358-9', 'INSISO', 'pro', array['logistica','finanzas']
where not exists (select 1 from public.empresas where rut = '78.469.358-9');

-- ============================================================================
-- PENDIENTE PARA LA MIGRACIÓN DEL MÓDULO LOGÍSTICA (Fase 1 del plan SaaS):
-- agregar empresa_id a cada tabla de negocio existente del fork Fapama con
-- default = empresa Fapama y backfill, y luego: select aplicar_rls_empresa('<tabla>');
-- Enumerar con:
--   select table_name from information_schema.tables where table_schema='public';
-- ============================================================================
