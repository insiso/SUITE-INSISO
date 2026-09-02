"use client";

import * as React from "react";
import Link from "next/link";
import { FolderKanban, Plus, Pencil, MapPin, ArrowRight, Search, Download } from "lucide-react";
import { exportarExcel } from "@/lib/excel";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useConsulta } from "@/lib/hooks";
import { mensajeError, formatCLP, formatFecha, formatPorcentaje, cn } from "@/lib/utils";
import type { Proyecto, EstadoProyecto, Usuario, VistaResumenProyecto } from "@/lib/types";
import { ESTADOS_PROYECTO, COLOR_ESTADO_PROYECTO } from "@/lib/constants";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Field, Select, Textarea } from "@/components/ui/field";
import { Modal, ModalFooter } from "@/components/ui/modal";
import { Card, CardContent } from "@/components/ui/card";
import { LoadingState, ErrorState, EmptyState } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";

type FormState = {
  codigo: string;
  nombre: string;
  ubicacion: string;
  descripcion: string;
  fecha_inicio: string;
  fecha_termino: string;
  presupuesto_total: string;
  estado: EstadoProyecto;
  responsable_id: string;
};

const FORM_VACIO: FormState = {
  codigo: "",
  nombre: "",
  ubicacion: "",
  descripcion: "",
  fecha_inicio: "",
  fecha_termino: "",
  presupuesto_total: "0",
  estado: "Planificación",
  responsable_id: "",
};

export default function ProyectosPage() {
  const toast = useToast();

  async function exportar() {
    try {
      await exportarExcel("proyectos_insiso", filtrados.map((p) => ({
        codigo: p.codigo,
        nombre: p.nombre,
        estado: p.estado,
        ubicacion: p.ubicacion ?? "",
        presupuesto_total: p.presupuesto_total,
        fecha_inicio: p.fecha_inicio ?? "",
        descripcion: p.descripcion ?? "",
      })), "Proyectos");
      toast.exito(`Exportados ${filtrados.length} proyecto(s) a Excel.`);
    } catch (err) {
      toast.error(mensajeError(err));
    }
  }
  const [modalAbierto, setModalAbierto] = React.useState(false);
  const [editando, setEditando] = React.useState<Proyecto | null>(null);
  const [form, setForm] = React.useState<FormState>(FORM_VACIO);
  const [guardando, setGuardando] = React.useState(false);
  const [busqueda, setBusqueda] = React.useState("");
  const [orden, setOrden] = React.useState<"az" | "za">("az");

  const { datos, cargando, error, refrescar } = useConsulta(async () => {
    const sb = getSupabaseClient();
    const [proyectos, resumen, usuarios] = await Promise.all([
      sb.from("proyectos").select("*").order("codigo"),
      sb.from("vista_resumen_proyectos").select("*"),
      sb.from("usuarios").select("id, nombre, email").eq("activo", true).order("nombre"),
    ]);
    if (proyectos.error) throw proyectos.error;
    if (resumen.error) throw resumen.error;
    if (usuarios.error) throw usuarios.error;
    return {
      proyectos: proyectos.data as Proyecto[],
      resumen: resumen.data as VistaResumenProyecto[],
      usuarios: usuarios.data as Pick<Usuario, "id" | "nombre" | "email">[],
    };
  });

  const proyectos = datos?.proyectos ?? [];
  const usuarios = datos?.usuarios ?? [];
  const filtrados = proyectos
    .filter((p) => {
      const q = busqueda.toLowerCase().trim();
      if (!q) return true;
      return (
        p.codigo.toLowerCase().includes(q) ||
        p.nombre.toLowerCase().includes(q) ||
        (p.ubicacion ?? "").toLowerCase().includes(q) ||
        p.estado.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      const cmp = a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" });
      return orden === "za" ? -cmp : cmp;
    });
  const mapResumen = React.useMemo(
    () => new Map((datos?.resumen ?? []).map((r) => [r.id, r])),
    [datos]
  );

  function abrirNuevo() {
    setEditando(null);
    setForm(FORM_VACIO);
    setModalAbierto(true);
  }

  function abrirEdicion(p: Proyecto) {
    setEditando(p);
    setForm({
      codigo: p.codigo,
      nombre: p.nombre,
      ubicacion: p.ubicacion ?? "",
      descripcion: p.descripcion ?? "",
      fecha_inicio: p.fecha_inicio ?? "",
      fecha_termino: p.fecha_termino ?? "",
      presupuesto_total: String(p.presupuesto_total),
      estado: p.estado,
      responsable_id: p.responsable_id ?? "",
    });
    setModalAbierto(true);
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!form.codigo.trim() || !form.nombre.trim()) {
      toast.error("Código y nombre son obligatorios.");
      return;
    }
    setGuardando(true);
    try {
      const sb = getSupabaseClient();
      const payload = {
        codigo: form.codigo.trim(),
        nombre: form.nombre.trim(),
        ubicacion: form.ubicacion.trim() || null,
        descripcion: form.descripcion.trim() || null,
        fecha_inicio: form.fecha_inicio || null,
        fecha_termino: form.fecha_termino || null,
        presupuesto_total: Number(form.presupuesto_total) || 0,
        estado: form.estado,
        responsable_id: form.responsable_id || null,
      };
      if (editando) {
        const { error } = await sb.from("proyectos").update(payload).eq("id", editando.id);
        if (error) throw error;
        toast.exito("Proyecto actualizado.");
      } else {
        const { error } = await sb.from("proyectos").insert(payload);
        if (error) throw error;
        toast.exito("Proyecto creado.");
      }
      setModalAbierto(false);
      refrescar();
    } catch (err) {
      toast.error(mensajeError(err));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div>
      <PageHeader
        titulo="Proyectos y Presupuestos"
        descripcion="Gestión de proyectos con seguimiento de desviaciones (asignado vs. gasto real)."
        icono={FolderKanban}
        acciones={
          <div className="flex gap-2">
            <Button variante="outline" onClick={exportar} disabled={filtrados.length === 0}>
              <Download className="h-4 w-4" /> Exportar
            </Button>
            <Button onClick={abrirNuevo}>
              <Plus className="h-4 w-4" /> Nuevo Proyecto
            </Button>
          </div>
        }
      />

      {!cargando && !error && proyectos.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1 max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Buscar por código, nombre, ubicación o estado…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} className="pl-9" />
          </div>
        <Select value={orden} onChange={(e) => setOrden(e.target.value as "az" | "za")} className="h-10 w-auto">
          <option value="az">A → Z</option>
          <option value="za">Z → A</option>
        </Select>
        </div>
      )}

      {cargando ? (
        <LoadingState mensaje="Cargando proyectos…" />
      ) : error ? (
        <ErrorState mensaje={error} onReintentar={refrescar} />
      ) : proyectos.length === 0 ? (
        <EmptyState
          titulo="Aún no hay proyectos"
          descripcion="Crea tu primer proyecto y define su presupuesto por categorías."
          accion={
            <Button onClick={abrirNuevo}>
              <Plus className="h-4 w-4" /> Nuevo Proyecto
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {filtrados.map((p) => {
            const r = mapResumen.get(p.id);
            const ejecucion = r?.porcentaje_ejecucion ?? 0;
            const gasto = r?.gasto_real ?? 0;
            const sobregiro = ejecucion > 100;
            return (
              <Card key={p.id} className="group transition-shadow hover:shadow-md">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-semibold text-primary">{p.codigo}</span>
                        <Badge color={COLOR_ESTADO_PROYECTO[p.estado]}>{p.estado}</Badge>
                      </div>
                      <h3 className="mt-1 text-lg font-semibold leading-tight">{p.nombre}</h3>
                      {p.ubicacion && (
                        <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                          <MapPin className="h-3.5 w-3.5" /> {p.ubicacion}
                        </p>
                      )}
                    </div>
                    <Button
                      variante="ghost"
                      tamano="icon"
                      onClick={() => abrirEdicion(p)}
                      aria-label="Editar"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">Presupuesto</p>
                      <p className="font-semibold">{formatCLP(p.presupuesto_total)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Gasto real</p>
                      <p className="font-semibold">{formatCLP(gasto)}</p>
                    </div>
                  </div>

                  {/* Barra de ejecución */}
                  <div className="mt-3">
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Ejecución presupuestaria</span>
                      <span className={cn("font-semibold", sobregiro ? "text-destructive" : "text-foreground")}>
                        {formatPorcentaje(ejecucion)}
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all",
                          sobregiro ? "bg-destructive" : ejecucion > 85 ? "bg-amber-500" : "bg-primary"
                        )}
                        style={{ width: `${Math.min(ejecucion, 100)}%` }}
                      />
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between border-t border-border pt-3 text-xs text-muted-foreground">
                    <span>
                      {formatFecha(p.fecha_inicio)} → {formatFecha(p.fecha_termino)}
                    </span>
                    <Link
                      href={`/proyectos/${p.id}`}
                      className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                    >
                      Ver detalle <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        abierto={modalAbierto}
        onCerrar={() => setModalAbierto(false)}
        titulo={editando ? "Editar Proyecto" : "Nuevo Proyecto"}
        descripcion="Datos generales del proyecto y presupuesto total."
        ancho="max-w-xl"
      >
        <form onSubmit={guardar} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Código" required>
              <Input
                value={form.codigo}
                onChange={(e) => setForm({ ...form, codigo: e.target.value })}
                placeholder="PRY-001"
              />
            </Field>
            <Field label="Estado" required>
              <Select
                value={form.estado}
                onChange={(e) => setForm({ ...form, estado: e.target.value as EstadoProyecto })}
              >
                {ESTADOS_PROYECTO.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Nombre" required>
            <Input
              value={form.nombre}
              onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              placeholder="Edificio Mirador Norte"
            />
          </Field>
          <Field label="Ubicación">
            <Input
              value={form.ubicacion}
              onChange={(e) => setForm({ ...form, ubicacion: e.target.value })}
              placeholder="Antofagasta, Región de Antofagasta"
            />
          </Field>
          <Field label="Descripción">
            <Textarea
              value={form.descripcion}
              onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
            />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Fecha de inicio">
              <Input
                type="date"
                value={form.fecha_inicio}
                onChange={(e) => setForm({ ...form, fecha_inicio: e.target.value })}
              />
            </Field>
            <Field label="Fecha de término">
              <Input
                type="date"
                value={form.fecha_termino}
                onChange={(e) => setForm({ ...form, fecha_termino: e.target.value })}
              />
            </Field>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Presupuesto total (CLP)">
              <Input
                type="number"
                min="0"
                step="1"
                value={form.presupuesto_total}
                onChange={(e) => setForm({ ...form, presupuesto_total: e.target.value })}
              />
            </Field>
            <Field label="Responsable">
              <Select
                value={form.responsable_id}
                onChange={(e) => setForm({ ...form, responsable_id: e.target.value })}
              >
                <option value="">— Sin asignar —</option>
                {usuarios.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nombre}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <ModalFooter>
            <Button type="button" variante="outline" onClick={() => setModalAbierto(false)}>
              Cancelar
            </Button>
            <Button type="submit" cargando={guardando}>
              {editando ? "Guardar cambios" : "Crear proyecto"}
            </Button>
          </ModalFooter>
        </form>
      </Modal>
    </div>
  );
}
