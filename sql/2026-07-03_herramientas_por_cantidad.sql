-- ============================================================================
-- Fapama ERP — Migración 2026-07-03
-- Herramientas por cantidad (fungibles: palas, martillos, llaves…) con stock
-- repartido por bodega. ADITIVA: no borra ni cambia las herramientas existentes
-- (quedan como "únicas": por_cantidad=false, cantidad=1).
-- ============================================================================

-- 1) Bandera y cantidad total en la ficha de herramienta
alter table public.herramientas
  add column if not exists por_cantidad boolean not null default false;
alter table public.herramientas
  add column if not exists cantidad integer not null default 1;

-- 2) Cantidad trasladada en cada movimiento (para historial)
alter table public.movimientos_herramientas
  add column if not exists cantidad integer not null default 1;

-- 3) Stock de herramientas por bodega (solo se usa para las "por cantidad")
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
