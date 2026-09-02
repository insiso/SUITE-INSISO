-- ============================================================================
-- Fapama ERP — Bitácora de auditoría (trazabilidad de cambios). ADITIVO.
-- Registra INSERT/UPDATE/DELETE de las tablas clave, con el usuario y la fecha.
-- Solo el rol Administrador puede leerla.
-- ============================================================================

-- email del usuario autenticado (para el registro)
create or replace function public.mi_email() returns text
language sql stable security definer set search_path = public as $$
  select email from public.usuarios where auth_user_id = auth.uid() limit 1;
$$;

create table if not exists public.auditoria (
  id            uuid primary key default gen_random_uuid(),
  tabla         text not null,
  registro_id   text,
  accion        text not null,            -- INSERT / UPDATE / DELETE
  usuario_email text,
  descripcion   text,                     -- resumen legible del registro afectado
  fecha         timestamptz not null default now()
);

alter table public.auditoria enable row level security;
drop policy if exists auditoria_lectura on public.auditoria;
create policy auditoria_lectura on public.auditoria
  for select to authenticated using (public.mi_rol() = 'Administrador');

create index if not exists idx_auditoria_fecha on public.auditoria(fecha desc);
create index if not exists idx_auditoria_tabla on public.auditoria(tabla);

-- función de trigger genérica (resiliente: si falla el log, NO rompe la operación)
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

-- aplicar el trigger a las tablas clave
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
