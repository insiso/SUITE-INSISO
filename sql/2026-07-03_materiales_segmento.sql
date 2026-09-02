-- Fapama ERP — 2026-07-03: segmento de materiales (Aseo / Oficina / Construcción). Aditivo.
alter table public.materiales
  add column if not exists segmento text not null default 'Construcción';
