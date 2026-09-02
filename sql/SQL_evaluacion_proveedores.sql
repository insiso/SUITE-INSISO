-- ============================================================================
-- Fapama ERP — Evaluación de proveedores
-- (1) tipo de pago en proveedor  (2) tabla de evaluaciones trimestrales (0-100)
-- ============================================================================

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
