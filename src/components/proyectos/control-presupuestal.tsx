"use client";

import * as React from "react";
import { Plus, Trash2, CheckCircle2, AlertTriangle, Building2, ShieldCheck } from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useConsulta } from "@/lib/hooks";
import { mensajeError, formatCLP, formatPorcentaje, cn } from "@/lib/utils";
import type { ControlPresupuestal, Subcontrato, Proveedor, EstadoSubcontrato } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Field, Select, Textarea } from "@/components/ui/field";
import { Modal, ModalFooter } from "@/components/ui/modal";
import { ConfirmDialog } from "@/components/ui/confirm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";

const COLOR_SUBCONTRATO: Record<EstadoSubcontrato, string> = {
  Vigente: "bg-emerald-100 text-emerald-700 ring-emerald-200",
  Finalizado: "bg-slate-100 text-slate-600 ring-slate-200",
  Anulado: "bg-rose-100 text-rose-700 ring-rose-200",
};

export function ControlPresupuestal({ proyectoId }: { proyectoId: string }) {
  const toast = useToast();
  const [modalAbierto, setModalAbierto] = React.useState(false);
  const [guardando, setGuardando] = React.useState(false);
  const [form, setForm] = React.useState({ proveedor_id: "", glosa: "", monto_total: "0" });
  const [sobregiro, setSobregiro] = React.useState<string | null>(null);
  const [finalizar, setFinalizar] = React.useState<Subcontrato | null>(null);
  const [procesando, setProcesando] = React.useState(false);

  const { datos, cargando, error, refrescar } = useConsulta(async () => {
    const sb = getSupabaseClient();
    const [control, subcontratos, proveedores] = await Promise.all([
      sb.rpc("fn_estado_presupuesto", { p_proyecto_id: proyectoId }),
      sb.from("subcontratos").select("*").eq("proyecto_id", proyectoId).order("created_at", { ascending: false }),
      sb.from("proveedores").select("id, razon_social").eq("activo", true).order("razon_social"),
    ]);
    if (control.error) throw control.error;
    if (subcontratos.error) throw subcontratos.error;
    if (proveedores.error) throw proveedores.error;
    const ctrl = (control.data as ControlPresupuestal[])?.[0] ?? null;
    return {
      control: ctrl,
      subcontratos: subcontratos.data as Subcontrato[],
      proveedores: proveedores.data as Pick<Proveedor, "id" | "razon_social">[],
    };
  }, [proyectoId]);

  const control = datos?.control;
  const subcontratos = datos?.subcontratos ?? [];
  const proveedores = datos?.proveedores ?? [];
  const mapProveedor = React.useMemo(
    () => new Map(proveedores.map((p) => [p.id, p.razon_social])),
    [proveedores]
  );

  async function crear(forzar = false) {
    if (!form.proveedor_id || !form.glosa.trim() || Number(form.monto_total) <= 0) {
      toast.error("Proveedor, glosa y monto (mayor a 0) son obligatorios.");
      return;
    }
    setGuardando(true);
    try {
      const res = await fetch("/api/subcontratos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proyecto_id: proyectoId,
          proveedor_id: form.proveedor_id,
          glosa: form.glosa.trim(),
          monto_total: Number(form.monto_total),
          forzar,
        }),
      });
      const json = await res.json();
      if (res.status === 409 && json.sobregiro) {
        setSobregiro(json.error);
        return;
      }
      if (!res.ok) throw new Error(json.error || "No se pudo crear el subcontrato.");
      toast.exito(forzar ? "Subcontrato creado (con sobregiro autorizado)." : "Subcontrato creado y comprometido.");
      setModalAbierto(false);
      setSobregiro(null);
      setForm({ proveedor_id: "", glosa: "", monto_total: "0" });
      refrescar();
    } catch (err) {
      toast.error(mensajeError(err));
    } finally {
      setGuardando(false);
    }
  }

  async function confirmarFinalizar() {
    if (!finalizar) return;
    setProcesando(true);
    try {
      const res = await fetch(`/api/subcontratos?id=${finalizar.id}&accion=finalizar`, { method: "PATCH" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "No se pudo finalizar.");
      toast.exito("Subcontrato finalizado.");
      setFinalizar(null);
      refrescar();
    } catch (err) {
      toast.error(mensajeError(err));
    } finally {
      setProcesando(false);
    }
  }

  const presupuesto = Number(control?.presupuesto ?? 0);
  const comprometido = Number(control?.comprometido ?? 0);
  const real = Number(control?.costo_real ?? 0);
  const disponible = Number(control?.disponible ?? 0);
  const pctComprometido = presupuesto > 0 ? (comprometido / presupuesto) * 100 : 0;
  const pctReal = presupuesto > 0 ? (real / presupuesto) * 100 : 0;
  const sobre = disponible < 0;

  return (
    <Card className="mb-6">
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" /> Control Presupuestal (Compromisos)
        </CardTitle>
        <Button tamano="sm" onClick={() => setModalAbierto(true)}>
          <Plus className="h-4 w-4" /> Nuevo Subcontrato
        </Button>
      </CardHeader>
      <CardContent>
        {cargando ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Cargando control presupuestal…</p>
        ) : error ? (
          <p className="py-6 text-center text-sm text-destructive">{error}</p>
        ) : (
          <>
            {/* Indicadores */}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Indicador etiqueta="Presupuesto" valor={presupuesto} color="text-foreground" />
              <Indicador etiqueta="Comprometido" valor={comprometido} color="text-amber-600" />
              <Indicador etiqueta="Real ejecutado" valor={real} color="text-rose-600" />
              <Indicador
                etiqueta="Disponible"
                valor={disponible}
                color={sobre ? "text-destructive" : "text-emerald-600"}
              />
            </div>

            {/* Barra apilada Comprometido + Real */}
            <div className="mt-4">
              <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-amber-400"
                  style={{ width: `${Math.min(pctComprometido, 100)}%` }}
                  title={`Comprometido: ${formatPorcentaje(pctComprometido)}`}
                />
                <div
                  className="h-full bg-rose-500"
                  style={{ width: `${Math.min(pctReal, Math.max(100 - pctComprometido, 0))}%` }}
                  title={`Real: ${formatPorcentaje(pctReal)}`}
                />
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-amber-400" /> Comprometido
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-rose-500" /> Real
                </span>
                <span className="ml-auto font-medium">
                  Consumido: {formatPorcentaje(pctComprometido + pctReal)}
                </span>
              </div>
              {sobre && (
                <div className="mt-3 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs font-medium text-destructive">
                  <AlertTriangle className="h-4 w-4" /> El proyecto está sobregirado en {formatCLP(Math.abs(disponible))}.
                </div>
              )}
            </div>

            {/* Lista de subcontratos */}
            <div className="mt-5">
              <h4 className="mb-2 text-sm font-semibold">Subcontratos ({subcontratos.length})</h4>
              {subcontratos.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border py-6 text-center text-sm text-muted-foreground">
                  Sin subcontratos. Crea uno para comprometer presupuesto.
                </p>
              ) : (
                <ul className="divide-y divide-border rounded-lg border border-border">
                  {subcontratos.map((s) => {
                    const pct = s.monto_total_contratado > 0
                      ? (s.monto_ejecutado / s.monto_total_contratado) * 100
                      : 0;
                    return (
                      <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="font-medium">{s.glosa}</span>
                            <Badge color={COLOR_SUBCONTRATO[s.estado]}>{s.estado}</Badge>
                          </div>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {mapProveedor.get(s.proveedor_id) ?? "—"} · Ejecutado{" "}
                            {formatCLP(s.monto_ejecutado)} de {formatCLP(s.monto_total_contratado)} (
                            {formatPorcentaje(pct)})
                          </p>
                        </div>
                        {s.estado === "Vigente" && (
                          <Button variante="outline" tamano="sm" onClick={() => setFinalizar(s)}>
                            <CheckCircle2 className="h-3.5 w-3.5" /> Finalizar
                          </Button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </>
        )}
      </CardContent>

      {/* Modal nuevo subcontrato */}
      <Modal
        abierto={modalAbierto}
        onCerrar={() => {
          setModalAbierto(false);
          setSobregiro(null);
        }}
        titulo="Nuevo Subcontrato"
        descripcion="El monto se reserva como presupuesto comprometido de inmediato."
        ancho="max-w-md"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            crear(false);
          }}
          className="space-y-4"
        >
          <Field label="Proveedor / Subcontratista" required>
            <Select
              value={form.proveedor_id}
              onChange={(e) => setForm({ ...form, proveedor_id: e.target.value })}
            >
              <option value="">— Selecciona —</option>
              {proveedores.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.razon_social}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Glosa / Descripción" required>
            <Textarea
              value={form.glosa}
              onChange={(e) => setForm({ ...form, glosa: e.target.value })}
              placeholder="Ej: Instalación eléctrica completa"
            />
          </Field>
          <Field label="Monto total contratado (CLP)" required>
            <Input
              type="number"
              min="0"
              step="1"
              value={form.monto_total}
              onChange={(e) => setForm({ ...form, monto_total: e.target.value })}
            />
          </Field>

          {sobregiro && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <p className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {sobregiro}
              </p>
            </div>
          )}

          <ModalFooter>
            <Button
              type="button"
              variante="outline"
              onClick={() => {
                setModalAbierto(false);
                setSobregiro(null);
              }}
            >
              Cancelar
            </Button>
            {sobregiro ? (
              <Button type="button" variante="destructive" cargando={guardando} onClick={() => crear(true)}>
                Crear con sobregiro
              </Button>
            ) : (
              <Button type="submit" cargando={guardando}>
                Crear subcontrato
              </Button>
            )}
          </ModalFooter>
        </form>
      </Modal>

      <ConfirmDialog
        abierto={!!finalizar}
        titulo="Finalizar subcontrato"
        mensaje={`¿Finalizar "${finalizar?.glosa}"? Su saldo no ejecutado dejará de estar comprometido.`}
        textoConfirmar="Finalizar"
        cargando={procesando}
        onConfirmar={confirmarFinalizar}
        onCancelar={() => setFinalizar(null)}
      />
    </Card>
  );
}

function Indicador({ etiqueta, valor, color }: { etiqueta: string; valor: number; color: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3">
      <p className="text-xs text-muted-foreground">{etiqueta}</p>
      <p className={cn("mt-0.5 text-base font-bold tabular-nums", color)}>{formatCLP(valor)}</p>
    </div>
  );
}
