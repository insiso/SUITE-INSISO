-- Fapama ERP — 2026-07-03: campo dirección para proveedores (aditivo).
alter table public.proveedores add column if not exists direccion text;
