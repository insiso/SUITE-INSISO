"use client";

import * as React from "react";
import { ScrollText, Search, ShieldAlert } from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useConsulta } from "@/lib/hooks";
import { formatFechaHora } from "@/lib/utils";
import type { Auditoria, RolUsuario } from "@/lib/types";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Input, Select } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { TableContainer, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { LoadingState, ErrorState, EmptyState } from "@/components/ui/states";

const ETIQUETA: Record<string, string> = { INSERT: "Creó", UPDATE: "Editó", DELETE: "Eliminó" };
const COLOR: Record<string, string> = {
  INSERT: "bg-emerald-100 text-emerald-700 ring-emerald-200",
  UPDATE: "bg-blue-100 text-blue-700 ring-blue-200",
  DELETE: "bg-rose-100 text-rose-700 ring-rose-200",
};

export default function AuditoriaPage() {
  const [busqueda, setBusqueda] = React.useState("");
  const [filtroAccion, setFiltroAccion] = React.useState("");
  const [filtroTabla, setFiltroTabla] = React.useState("");

  const { datos, cargando, error, refrescar } = useConsulta(async () => {
    const sb = getSupabaseClient();
    const {
      data: { user },
    } = await sb.auth.getUser();
    const perfil = user
      ? await sb.from("usuarios").select("rol").eq("auth_user_id", user.id).maybeSingle()
      : { data: null };
    const esAdmin = (perfil.data as { rol?: RolUsuario } | null)?.rol === "Administrador";
    if (!esAdmin) return { esAdmin: false, registros: [] as Auditoria[] };
    const { data, error } = await sb
      .from("auditoria")
      .select("*")
      .order("fecha", { ascending: false })
      .limit(500);
    if (error) throw error;
    return { esAdmin: true, registros: (data ?? []) as Auditoria[] };
  });

  const esAdmin = datos?.esAdmin ?? false;
  const registros = datos?.registros ?? [];
  const tablas = React.useMemo(
    () => Array.from(new Set(registros.map((r) => r.tabla))).sort(),
    [registros]
  );

  const filtrados = registros.filter((r) => {
    if (filtroAccion && r.accion !== filtroAccion) return false;
    if (filtroTabla && r.tabla !== filtroTabla) return false;
    const q = busqueda.toLowerCase().trim();
    if (!q) return true;
    return (
      (r.usuario_email ?? "").toLowerCase().includes(q) ||
      (r.descripcion ?? "").toLowerCase().includes(q) ||
      r.tabla.toLowerCase().includes(q)
    );
  });

  return (
    <div>
      <PageHeader
        titulo="Auditoría"
        descripcion="Bitácora de cambios del sistema: quién creó, editó o eliminó cada registro."
        icono={ScrollText}
      />

      {cargando ? (
        <LoadingState mensaje="Cargando bitácora…" />
      ) : error ? (
        <ErrorState mensaje={error} onReintentar={refrescar} />
      ) : !esAdmin ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-amber-200 bg-amber-50 py-12 px-6 text-center">
          <ShieldAlert className="h-8 w-8 text-amber-600" />
          <div>
            <p className="font-medium text-amber-800">Acceso restringido</p>
            <p className="mt-1 max-w-md text-sm text-amber-700">
              Solo los usuarios con rol <strong>Administrador</strong> pueden ver la auditoría.
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative max-w-xs flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por usuario o registro…"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={filtroAccion} onChange={(e) => setFiltroAccion(e.target.value)} className="sm:max-w-[160px]">
              <option value="">Todas las acciones</option>
              <option value="INSERT">Creó</option>
              <option value="UPDATE">Editó</option>
              <option value="DELETE">Eliminó</option>
            </Select>
            <Select value={filtroTabla} onChange={(e) => setFiltroTabla(e.target.value)} className="sm:max-w-[180px]">
              <option value="">Todos los módulos</option>
              {tablas.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
            <Button variante="outline" tamano="sm" onClick={refrescar}>
              Actualizar
            </Button>
          </div>

          {filtrados.length === 0 ? (
            <EmptyState
              titulo="Sin registros"
              descripcion="Aún no hay movimientos que coincidan con el filtro. Los cambios se irán registrando automáticamente."
            />
          ) : (
            <TableContainer>
              <THead>
                <TR>
                  <TH>Fecha</TH>
                  <TH>Usuario</TH>
                  <TH>Acción</TH>
                  <TH>Módulo</TH>
                  <TH>Registro</TH>
                </TR>
              </THead>
              <TBody>
                {filtrados.map((r) => (
                  <TR key={r.id}>
                    <TD className="whitespace-nowrap text-xs">{formatFechaHora(r.fecha)}</TD>
                    <TD className="text-xs text-muted-foreground">{r.usuario_email ?? "—"}</TD>
                    <TD>
                      <Badge color={COLOR[r.accion] ?? "bg-slate-100 text-slate-600 ring-slate-200"}>
                        {ETIQUETA[r.accion] ?? r.accion}
                      </Badge>
                    </TD>
                    <TD className="text-xs">{r.tabla}</TD>
                    <TD className="max-w-[280px] truncate text-sm font-medium" title={r.descripcion ?? ""}>
                      {r.descripcion ?? "—"}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </TableContainer>
          )}

          <p className="mt-3 text-xs text-muted-foreground">
            {filtrados.length} registro(s) · se muestran los últimos 500 cambios.
          </p>
        </>
      )}
    </div>
  );
}
