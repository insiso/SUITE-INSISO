"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Plus,
  Trash2,
  MapPin,
  CalendarRange,
  Wallet,
  TrendingDown,
  Receipt,
} from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useConsulta } from "@/lib/hooks";
import { mensajeError, formatCLP, formatFecha, formatPorcentaje, cn } from "@/lib/utils";
import type {
  Proyecto,
  Presupuesto,
  Gasto,
  VistaDesviacion,
  CategoriaPresupuesto,
} from "@/lib/types";
import { CATEGORIAS_PRESUPUESTO, COLOR_ESTADO_PROYECTO } from "@/lib/constants";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Field, Select, Textarea } from "@/components/ui/field";
import { Modal, ModalFooter } from "@/components/ui/modal";
import { ConfirmDialog } from "@/components/ui/confirm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingState, ErrorState, EmptyState } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { ControlPresupuestal } from "@/components/proyectos/control-presupuestal";

export default function ProyectoDetallePage({ params }: { params: { id: string } }) {
  const { id } = params;
  const toast = useToast();

  const [modalPresupuesto, setModalPresupuesto] = React.useState(false);
  const [modalGasto, setModalGasto] = React.useState(false);
  const [guardando, setGuardando] = React.useState(false);
  const [borrarPresupuesto, setBorrarPresupuesto] = React.useState<Presupuesto | null>(null);
  const [borrarGasto, setBorrarGasto] = React.useState<Gasto | null>(null);
  const [eliminando, setEliminando] = React.useState(false);

  const [formP, setFormP] = React.useState({
    categoria: "Materiales" as CategoriaPresupuesto,
    descripcion: "",
    monto_asignado: "0",
  });
  const [formG, setFormG] = React.useState({
    categoria: "Materiales" as CategoriaPresupuesto,
    descripcion: "",
    monto: "0",
    fecha: new Date().toISOString().slice(0, 10),
  });

  const { datos, cargando, error, refrescar } = useConsulta(async () => {
    const sb = getSupabaseClient();
    const [proyecto, presupuestos, desviacion, gastos] = await Promise.all([
      sb.from("proyectos").select("*").eq("id", id).single(),
      sb.from("presupuestos").select("*").eq("proyecto_id", id).order("categoria"),
      sb.from("vista_desviacion_presupuesto").select("*").eq("proyecto_id", id),
      sb.from("gastos").select("*").eq("proyecto_id", id).order("fecha", { ascending: false }),
    ]);
    if (proyecto.error) throw proyecto.error;
    if (presupuestos.error) throw presupuestos.error;
    if (desviacion.error) throw desviacion.error;
    if (gastos.error) throw gastos.error;
    return {
      proyecto: proyecto.data as Proyecto,
      presupuestos: presupuestos.data as Presupuesto[],
      desviacion: desviacion.data as VistaDesviacion[],
      gastos: gastos.data as Gasto[],
    };
  }, [id]);

  const proyecto = datos?.proyecto;
  const presupuestos = datos?.presupuestos ?? [];
  const desviacion = datos?.desviacion ?? [];
  const gastos = datos?.gastos ?? [];

  const totalAsignado = desviacion.reduce((s, d) => s + Number(d.asignado), 0);
  const totalGastado = desviacion.reduce((s, d) => s + Number(d.gastado), 0);
  const saldo = totalAsignado - totalGastado;
  const ejecucion = totalAsignado > 0 ? (totalGastado / totalAsignado) * 100 : 0;

  async function guardarPresupuesto(e: React.FormEvent) {
    e.preventDefault();
    setGuardando(true);
    try {
      const sb = getSupabaseClient();
      const { error } = await sb.from("presupuestos").insert({
        proyecto_id: id,
        categoria: formP.categoria,
        descripcion: formP.descripcion.trim() || null,
        monto_asignado: Number(formP.monto_asignado) || 0,
      });
      if (error) throw error;
      toast.exito("Partida presupuestaria agregada.");
      setModalPresupuesto(false);
      setFormP({ categoria: "Materiales", descripcion: "", monto_asignado: "0" });
      refrescar();
    } catch (err) {
      toast.error(mensajeError(err));
    } finally {
      setGuardando(false);
    }
  }

  async function guardarGasto(e: React.FormEvent) {
    e.preventDefault();
    setGuardando(true);
    try {
      const sb = getSupabaseClient();
      const { error } = await sb.from("gastos").insert({
        proyecto_id: id,
        categoria: formG.categoria,
        descripcion: formG.descripcion.trim() || null,
        monto: Number(formG.monto) || 0,
        fecha: formG.fecha,
      });
      if (error) throw error;
      toast.exito("Gasto registrado.");
      setModalGasto(false);
      setFormG({
        categoria: "Materiales",
        descripcion: "",
        monto: "0",
        fecha: new Date().toISOString().slice(0, 10),
      });
      refrescar();
    } catch (err) {
      toast.error(mensajeError(err));
    } finally {
      setGuardando(false);
    }
  }

  async function eliminarPresupuesto() {
    if (!borrarPresupuesto) return;
    setEliminando(true);
    try {
      const sb = getSupabaseClient();
      const { error } = await sb.from("presupuestos").delete().eq("id", borrarPresupuesto.id);
      if (error) throw error;
      toast.exito("Partida eliminada.");
      setBorrarPresupuesto(null);
      refrescar();
    } catch (err) {
      toast.error(mensajeError(err));
    } finally {
      setEliminando(false);
    }
  }

  async function eliminarGasto() {
    if (!borrarGasto) return;
    setEliminando(true);
    try {
      const sb = getSupabaseClient();
      const { error } = await sb.from("gastos").delete().eq("id", borrarGasto.id);
      if (error) throw error;
      toast.exito("Gasto eliminado.");
      setBorrarGasto(null);
      refrescar();
    } catch (err) {
      toast.error(mensajeError(err));
    } finally {
      setEliminando(false);
    }
  }

  if (cargando) return <LoadingState mensaje="Cargando proyecto…" />;
  if (error) return <ErrorState mensaje={error} onReintentar={refrescar} />;
  if (!proyecto) return <ErrorState mensaje="Proyecto no encontrado." />;

  return (
    <div>
      <Link
        href="/proyectos"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Volver a proyectos
      </Link>

      {/* Cabecera */}
      <div className="mb-6 flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-mono text-sm font-semibold text-primary">{proyecto.codigo}</span>
          <Badge color={COLOR_ESTADO_PROYECTO[proyecto.estado]}>{proyecto.estado}</Badge>
        </div>
        <h1 className="text-2xl font-bold tracking-tight">{proyecto.nombre}</h1>
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
          {proyecto.ubicacion && (
            <span className="flex items-center gap-1.5">
              <MapPin className="h-4 w-4" /> {proyecto.ubicacion}
            </span>
          )}
          <span className="flex items-center gap-1.5">
            <CalendarRange className="h-4 w-4" /> {formatFecha(proyecto.fecha_inicio)} →{" "}
            {formatFecha(proyecto.fecha_termino)}
          </span>
        </div>
        {proyecto.descripcion && (
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{proyecto.descripcion}</p>
        )}
      </div>

      {/* KPIs financieros */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiFin icono={Wallet} etiqueta="Presupuesto total" valor={formatCLP(proyecto.presupuesto_total)} color="text-primary" />
        <KpiFin icono={Receipt} etiqueta="Gasto real" valor={formatCLP(totalGastado)} color="text-rose-600" />
        <KpiFin
          icono={TrendingDown}
          etiqueta="Saldo disponible"
          valor={formatCLP(saldo)}
          color={saldo < 0 ? "text-destructive" : "text-emerald-600"}
        />
        <Card>
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground">Ejecución</p>
            <p className={cn("text-xl font-bold", ejecucion > 100 ? "text-destructive" : "text-foreground")}>
              {formatPorcentaje(ejecucion)}
            </p>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={cn("h-full rounded-full", ejecucion > 100 ? "bg-destructive" : "bg-primary")}
                style={{ width: `${Math.min(ejecucion, 100)}%` }}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Control presupuestal: Comprometido (subcontratos) vs Real (facturas) */}
      <ControlPresupuestal proyectoId={id} />

      {/* Desviación por categoría */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Desviación Presupuestaria por Categoría</CardTitle>
        </CardHeader>
        <CardContent>
          {desviacion.length === 0 ? (
            <EmptyState
              titulo="Sin presupuesto definido"
              descripcion="Agrega partidas presupuestarias para ver las desviaciones."
            />
          ) : (
            <div className="overflow-x-auto scrollbar-thin">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 text-left font-semibold">Categoría</th>
                    <th className="py-2 text-right font-semibold">Asignado</th>
                    <th className="py-2 text-right font-semibold">Gastado</th>
                    <th className="py-2 text-right font-semibold">Saldo</th>
                    <th className="py-2 pl-6 text-left font-semibold">Avance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {desviacion.map((d) => {
                    const pct = Number(d.asignado) > 0 ? (Number(d.gastado) / Number(d.asignado)) * 100 : 0;
                    const exceso = Number(d.saldo) < 0;
                    return (
                      <tr key={d.categoria}>
                        <td className="py-3 font-medium">{d.categoria}</td>
                        <td className="py-3 text-right tabular-nums">{formatCLP(d.asignado)}</td>
                        <td className="py-3 text-right tabular-nums">{formatCLP(d.gastado)}</td>
                        <td
                          className={cn(
                            "py-3 text-right font-semibold tabular-nums",
                            exceso ? "text-destructive" : "text-emerald-600"
                          )}
                        >
                          {formatCLP(d.saldo)}
                        </td>
                        <td className="py-3 pl-6">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-28 overflow-hidden rounded-full bg-muted">
                              <div
                                className={cn(
                                  "h-full rounded-full",
                                  exceso ? "bg-destructive" : pct > 85 ? "bg-amber-500" : "bg-primary"
                                )}
                                style={{ width: `${Math.min(pct, 100)}%` }}
                              />
                            </div>
                            <span className="text-xs text-muted-foreground">{formatPorcentaje(pct)}</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-border font-semibold">
                    <td className="py-3">Total</td>
                    <td className="py-3 text-right tabular-nums">{formatCLP(totalAsignado)}</td>
                    <td className="py-3 text-right tabular-nums">{formatCLP(totalGastado)}</td>
                    <td className={cn("py-3 text-right tabular-nums", saldo < 0 ? "text-destructive" : "text-emerald-600")}>
                      {formatCLP(saldo)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Partidas presupuestarias */}
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>Partidas Presupuestarias</CardTitle>
            <Button tamano="sm" onClick={() => setModalPresupuesto(true)}>
              <Plus className="h-4 w-4" /> Agregar
            </Button>
          </CardHeader>
          <CardContent>
            {presupuestos.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Sin partidas definidas.</p>
            ) : (
              <ul className="divide-y divide-border">
                {presupuestos.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 py-3">
                    <div>
                      <Badge>{p.categoria}</Badge>
                      {p.descripcion && <p className="mt-1 text-sm text-muted-foreground">{p.descripcion}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold tabular-nums">{formatCLP(p.monto_asignado)}</span>
                      <Button
                        variante="ghost"
                        tamano="icon"
                        onClick={() => setBorrarPresupuesto(p)}
                        aria-label="Eliminar"
                        className="text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Gastos */}
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>Gastos Registrados</CardTitle>
            <Button tamano="sm" onClick={() => setModalGasto(true)}>
              <Plus className="h-4 w-4" /> Registrar gasto
            </Button>
          </CardHeader>
          <CardContent>
            {gastos.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Sin gastos manuales. El consumo de materiales se suma automáticamente.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {gastos.map((g) => (
                  <li key={g.id} className="flex items-center justify-between gap-3 py-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge>{g.categoria}</Badge>
                        <span className="text-xs text-muted-foreground">{formatFecha(g.fecha)}</span>
                      </div>
                      {g.descripcion && <p className="mt-1 text-sm text-muted-foreground">{g.descripcion}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold tabular-nums">{formatCLP(g.monto)}</span>
                      <Button
                        variante="ghost"
                        tamano="icon"
                        onClick={() => setBorrarGasto(g)}
                        aria-label="Eliminar"
                        className="text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-[11px] text-muted-foreground">
              Nota: el consumo de materiales imputado a este proyecto (salidas) se valoriza y suma
              automáticamente a la categoría «Materiales».
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Modal partida presupuestaria */}
      <Modal
        abierto={modalPresupuesto}
        onCerrar={() => setModalPresupuesto(false)}
        titulo="Nueva Partida Presupuestaria"
        ancho="max-w-md"
      >
        <form onSubmit={guardarPresupuesto} className="space-y-4">
          <Field label="Categoría" required>
            <Select
              value={formP.categoria}
              onChange={(e) => setFormP({ ...formP, categoria: e.target.value as CategoriaPresupuesto })}
            >
              {CATEGORIAS_PRESUPUESTO.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Descripción">
            <Input
              value={formP.descripcion}
              onChange={(e) => setFormP({ ...formP, descripcion: e.target.value })}
              placeholder="Hormigón, fierro, áridos…"
            />
          </Field>
          <Field label="Monto asignado (CLP)" required>
            <Input
              type="number"
              min="0"
              step="1"
              value={formP.monto_asignado}
              onChange={(e) => setFormP({ ...formP, monto_asignado: e.target.value })}
            />
          </Field>
          <ModalFooter>
            <Button type="button" variante="outline" onClick={() => setModalPresupuesto(false)}>
              Cancelar
            </Button>
            <Button type="submit" cargando={guardando}>
              Agregar partida
            </Button>
          </ModalFooter>
        </form>
      </Modal>

      {/* Modal gasto */}
      <Modal abierto={modalGasto} onCerrar={() => setModalGasto(false)} titulo="Registrar Gasto" ancho="max-w-md">
        <form onSubmit={guardarGasto} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Categoría" required>
              <Select
                value={formG.categoria}
                onChange={(e) => setFormG({ ...formG, categoria: e.target.value as CategoriaPresupuesto })}
              >
                {CATEGORIAS_PRESUPUESTO.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Fecha" required>
              <Input
                type="date"
                value={formG.fecha}
                onChange={(e) => setFormG({ ...formG, fecha: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Descripción">
            <Textarea
              value={formG.descripcion}
              onChange={(e) => setFormG({ ...formG, descripcion: e.target.value })}
              placeholder="Avance planilla, arriendo maquinaria…"
            />
          </Field>
          <Field label="Monto (CLP)" required>
            <Input
              type="number"
              min="0"
              step="1"
              value={formG.monto}
              onChange={(e) => setFormG({ ...formG, monto: e.target.value })}
            />
          </Field>
          <ModalFooter>
            <Button type="button" variante="outline" onClick={() => setModalGasto(false)}>
              Cancelar
            </Button>
            <Button type="submit" cargando={guardando}>
              Registrar gasto
            </Button>
          </ModalFooter>
        </form>
      </Modal>

      <ConfirmDialog
        abierto={!!borrarPresupuesto}
        titulo="Eliminar partida"
        mensaje="¿Eliminar esta partida presupuestaria?"
        cargando={eliminando}
        onConfirmar={eliminarPresupuesto}
        onCancelar={() => setBorrarPresupuesto(null)}
      />
      <ConfirmDialog
        abierto={!!borrarGasto}
        titulo="Eliminar gasto"
        mensaje="¿Eliminar este gasto registrado?"
        cargando={eliminando}
        onConfirmar={eliminarGasto}
        onCancelar={() => setBorrarGasto(null)}
      />
    </div>
  );
}

function KpiFin({
  icono: Icono,
  etiqueta,
  valor,
  color,
}: {
  icono: React.ComponentType<{ className?: string }>;
  etiqueta: string;
  valor: string;
  color: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-5">
        <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl bg-muted", color)}>
          <Icono className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{etiqueta}</p>
          <p className="truncate text-lg font-bold tracking-tight">{valor}</p>
        </div>
      </CardContent>
    </Card>
  );
}
