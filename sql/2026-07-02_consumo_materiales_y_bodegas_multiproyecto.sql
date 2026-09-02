-- ============================================================================
-- Fapama ERP — Migración 2026-07-02
-- 1) Bodegas con múltiples proyectos (bodega central compartida)
-- 2) (El consumo de materiales usa la tabla existente movimientos_kardex:
--     un movimiento tipo 'SALIDA' con proyecto_id descuenta stock e imputa
--     el gasto al proyecto. No requiere cambios de esquema.)
-- ============================================================================

-- Tabla puente bodega <-> proyectos (muchos a muchos)
create table if not exists public.bodega_proyectos (
  bodega_id   uuid not null references public.bodegas(id)   on delete cascade,
  proyecto_id uuid not null references public.proyectos(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (bodega_id, proyecto_id)
);

comment on table public.bodega_proyectos is
  'Proyectos que pueden usar una bodega. Permite que una bodega central sirva a varios proyectos.';

-- Seguridad a nivel de fila: solo usuarios autenticados
alter table public.bodega_proyectos enable row level security;

drop policy if exists bodega_proyectos_auth on public.bodega_proyectos;
create policy bodega_proyectos_auth on public.bodega_proyectos
  for all to authenticated using (true) with check (true);

-- Índice para consultar rápido los proyectos de cada bodega y viceversa
create index if not exists idx_bodega_proyectos_proyecto
  on public.bodega_proyectos (proyecto_id);
