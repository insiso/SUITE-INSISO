"use client";

import * as React from "react";
import { Warehouse, Plus, Pencil, Trash2, MapPin, Search, Download } from "lucide-react";
import { exportarExcel } from "@/lib/excel";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useConsulta } from "@/lib/hooks";
import { mensajeError } from "@/lib/utils";
import type { Bodega, BodegaProyecto, Proyecto, TipoBodega } from "@/lib/types";
import { TIPOS_BODEGA } from "@/lib/constants";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Field, Select } from "@/components/ui/field";
import { Modal, ModalFooter } from "@/components/ui/modal";
import { ConfirmDialog } from "@/components/ui/confirm";
import { Card, CardContent } from "@/components/ui/card";
import { LoadingState, ErrorState, EmptyState } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { useMultiSeleccion, BotonSeleccionar, BarraSeleccion, CasillaFila } from "@/components/ui/multiseleccion";

type ProyectoMini = Pick<Proyecto, "id" | "codigo" | "nombre">;

type FormState = {
  codigo: string;
  nombre: string;
  tipo: TipoBodega;
  ubicacion: string;
  proyectos_ids: string[];
  activo: boolean;
};

const FORM_VACIO: FormState = {
  codigo: "",
  nombre: "",
  tipo: "Central",
  ubicacion: "",
  proyectos_ids: [],
  activo: true,
};

const COLOR_TIPO: Record<TipoBodega, string> = {
  Central: "bg-primary/10 text-primary ring-primary/20",
  Proyecto: "bg-emerald-100 text-emerald-700 ring-emerald-200",
  Virtual: "bg-violet-100 text-violet-700 ring-violet-200",
  Tránsito: "bg-amber-100 text-amber-700 ring-amber-200",
};

export default function BodegasPage() {
  const toast = useToast();

  async function exportar() {
    try {
      await exportarExcel("bodegas_fapama", filtradas.map((b) => ({
        codigo: b.codigo,
        nombre: b.nombre,
        tipo: b.tipo,
        ubicacion: b.ubicacion ?? "",
        activo: b.activo ? "Sí" : "No",
      })), "Bodegas");
      toast.exito(`Exportadas ${filtradas.length} bodega(s) a Excel.`);
    } catch (err) {
      toast.error(mensajeError(err));
    }
  }
  const [modalAbierto, setModalAbierto] = React.useState(false);
  const [editando, setEditando] = React.useState<Bodega | null>(null);
  const [form, setForm] = React.useState<FormState>(FORM_VACIO);
  const [guardando, setGuardando] = React.useState(false);
  const [aEliminar, setAEliminar] = React.useState<Bodega | null>(null);
  const [eliminando, setEliminando] = React.useState(false);
  const [busqueda, setBusqueda] = React.useState("");
  const [orden, setOrden] = React.useState<"az" | "za">("az");
  const msel = useMultiSeleccion();
  const [bulkConfirm, setBulkConfirm] = React.useState(false);
  const [eliminandoBulk, setEliminandoBulk] = React.useState(false);

  const { datos, cargando, error, refrescar } = useConsulta(async () => {
    const sb = getSupabaseClient();
    const [bodegas, proyectos, vinculos] = await Promise.all([
      sb.from("bodegas").select("*").order("codigo"),
      sb.from("proyectos").select("id, codigo, nombre").order("codigo"),
      sb.from("bodega_proyectos").select("bodega_id, proyecto_id"),
    ]);
    if (bodegas.error) throw bodegas.error;
    if (proyectos.error) throw proyectos.error;
    if (vinculos.error) throw vinculos.error;
    return {
      bodegas: bodegas.data as Bodega[],
      proyectos: proyectos.data as ProyectoMini[],
      vinculos: (vinculos.data ?? []) as Pick<BodegaProyecto, "bodega_id" | "proyecto_id">[],
    };
  });

  const bodegas = datos?.bodegas ?? [];
  const proyectos = datos?.proyectos ?? [];
  const vinculos = datos?.vinculos ?? [];
  const filtradas = bodegas
    .filter((b) => {
      const q = busqueda.toLowerCase().trim();
      if (!q) return true;
      return (
        b.codigo.toLowerCase().includes(q) ||
        b.nombre.toLowerCase().includes(q) ||
        b.tipo.toLowerCase().includes(q) ||
        (b.ubicacion ?? "").toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      const cmp = a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" });
      return orden === "za" ? -cmp : cmp;
    });

  // Mapa: bodega_id -> [proyecto_id, ...]
  const proyectosPorBodega = React.useMemo(() => {
    const m = new Map<string, string[]>();
    for (const v of vinculos) {
      const arr = m.get(v.bodega_id) ?? [];
      arr.push(v.proyecto_id);
      m.set(v.bodega_id, arr);
    }
    return m;
  }, [vinculos]);

  const mapProyecto = React.useMemo(
    () => new Map(proyectos.map((p) => [p.id, p])),
    [proyectos]
  );

  function etiquetasProyectos(bodegaId: string): string[] {
    const ids = proyectosPorBodega.get(bodegaId) ?? [];
    return ids
      .map((id) => {
        const p = mapProyecto.get(id);
        return p ? `${p.codigo}` : null;
      })
      .filter((x): x is string => !!x);
  }

  function abrirNuevo() {
    setEditando(null);
    setForm(FORM_VACIO);
    setModalAbierto(true);
  }

  function abrirEdicion(b: Bodega) {
    setEditando(b);
    setForm({
      codigo: b.codigo,
      nombre: b.nombre,
      tipo: b.tipo,
      ubicacion: b.ubicacion ?? "",
      proyectos_ids: proyectosPorBodega.get(b.id) ?? [],
      activo: b.activo,
    });
    setModalAbierto(true);
  }

  function toggleProyecto(id: string) {
    setForm((f) => ({
      ...f,
      proyectos_ids: f.proyectos_ids.includes(id)
        ? f.proyectos_ids.filter((x) => x !== id)
        : [...f.proyectos_ids, id],
    }));
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
        tipo: form.tipo,
        ubicacion: form.ubicacion.trim() || null,
        // Compatibilidad: guardamos el primer proyecto como "principal"
        proyecto_id: form.proyectos_ids[0] ?? null,
        activo: form.activo,
      };

      let bodegaId: string;
      if (editando) {
        const { error } = await sb.from("bodegas").update(payload).eq("id", editando.id);
        if (error) throw error;
        bodegaId = editando.id;
      } else {
        const { data, error } = await sb
          .from("bodegas")
          .insert(payload)
          .select("id")
          .single();
        if (error) throw error;
        bodegaId = (data as { id: string }).id;
      }

      // Sincronizar los proyectos asignados (bodega_proyectos)
      const del = await sb.from("bodega_proyectos").delete().eq("bodega_id", bodegaId);
      if (del.error) throw del.error;
      if (form.proyectos_ids.length > 0) {
        const filas = form.proyectos_ids.map((pid) => ({
          bodega_id: bodegaId,
          proyecto_id: pid,
        }));
        const ins = await sb.from("bodega_proyectos").insert(filas);
        if (ins.error) throw ins.error;
      }

      toast.exito(editando ? "Bodega actualizada." : "Bodega creada.");
      setModalAbierto(false);
      refrescar();
    } catch (err) {
      toast.error(mensajeError(err));
    } finally {
      setGuardando(false);
    }
  }

  async function desactivarSeleccionados() {
    const ids = Array.from(msel.sel);
    if (ids.length === 0) return;
    setEliminandoBulk(true);
    const sb = getSupabaseClient();
    const { error } = await sb.from("bodegas").update({ activo: false }).in("id", ids);
    if (error) toast.error(mensajeError(error));
    else toast.exito(`${ids.length} bodega(s) desactivado(s).`);
    setEliminandoBulk(false);
    msel.salir();
    refrescar();
  }

  async function eliminarSeleccionadas() {
    const ids = Array.from(msel.sel);
    if (ids.length === 0) return;
    setEliminandoBulk(true);
    const sb = getSupabaseClient();
    let ok = 0;
    let fail = 0;
    for (const id of ids) {
      const { error } = await sb.from("bodegas").delete().eq("id", id);
      if (error) fail++;
      else ok++;
    }
    toast.exito(`${ok} eliminada(s).` + (fail ? ` ${fail} no se pudo(n) eliminar (en uso).` : ""));
    setBulkConfirm(false);
    setEliminandoBulk(false);
    msel.salir();
    refrescar();
  }

  async function eliminar() {
    if (!aEliminar) return;
    setEliminando(true);
    try {
      const sb = getSupabaseClient();
      const { error } = await sb.from("bodegas").delete().eq("id", aEliminar.id);
      if (error) throw error;
      toast.exito("Bodega eliminada.");
      setAEliminar(null);
      refrescar();
    } catch (err) {
      toast.error(mensajeError(err));
    } finally {
      setEliminando(false);
    }
  }

  return (
    <div>
      <PageHeader
        titulo="Bodegas"
        descripcion="Gestión multi-bodega: una bodega puede servir a varios proyectos (bodega central)."
        icono={Warehouse}
        acciones={
          <div className="flex flex-wrap gap-2">
            <Button variante="outline" onClick={exportar} disabled={filtradas.length === 0}>
              <Download className="h-4 w-4" /> Exportar
            </Button>
            <BotonSeleccionar modo={msel.modo} onClick={() => (msel.modo ? msel.salir() : msel.setModo(true))} />
            <Button onClick={abrirNuevo}>
              <Plus className="h-4 w-4" /> Nueva Bodega
            </Button>
          </div>
        }
      />

      {!cargando && !error && bodegas.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1 max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Buscar por código, nombre, tipo o ubicación…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} className="pl-9" />
          </div>
        <Select value={orden} onChange={(e) => setOrden(e.target.value as "az" | "za")} className="h-10 w-auto">
          <option value="az">A → Z</option>
          <option value="za">Z → A</option>
        </Select>
        </div>
      )}

      {msel.modo && (
        <BarraSeleccion
          total={filtradas.length}
          cantidad={msel.sel.size}
          todosMarcados={filtradas.length > 0 && filtradas.every((b) => msel.sel.has(b.id))}
          onTodos={() => msel.seleccionarTodos(filtradas.map((b) => b.id))}
          onEliminar={() => setBulkConfirm(true)}
          onDesactivar={desactivarSeleccionados}
        />
      )}

      {cargando ? (
        <LoadingState mensaje="Cargando bodegas…" />
      ) : error ? (
        <ErrorState mensaje={error} onReintentar={refrescar} />
      ) : bodegas.length === 0 ? (
        <EmptyState
          titulo="Aún no hay bodegas"
          descripcion="Crea una bodega central y bodegas por proyecto para distribuir el inventario."
          accion={
            <Button onClick={abrirNuevo}>
              <Plus className="h-4 w-4" /> Nueva Bodega
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtradas.map((b) => {
            const etiquetas = etiquetasProyectos(b.id);
            return (
              <Card key={b.id} className="flex flex-col">
                <CardContent className="flex flex-1 flex-col gap-3 p-5">
                  {msel.modo && (
                    <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-muted-foreground">
                      <CasillaFila marcado={msel.sel.has(b.id)} onChange={() => msel.toggle(b.id)} /> Seleccionar
                    </label>
                  )}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Warehouse className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="font-mono text-xs font-semibold text-muted-foreground">{b.codigo}</p>
                        <p className="font-semibold leading-tight">{b.nombre}</p>
                      </div>
                    </div>
                    <Badge color={COLOR_TIPO[b.tipo]}>{b.tipo}</Badge>
                  </div>

                  <div className="space-y-1.5 text-sm text-muted-foreground">
                    {b.ubicacion && (
                      <p className="flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5" /> {b.ubicacion}
                      </p>
                    )}
                    {etiquetas.length > 0 ? (
                      <div>
                        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70">
                          Proyectos ({etiquetas.length})
                        </p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {etiquetas.map((cod) => (
                            <Badge key={cod} color="bg-slate-100 text-slate-700 ring-slate-200">
                              {cod}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs italic text-muted-foreground/70">Sin proyectos asignados</p>
                    )}
                    {!b.activo && <Badge color="bg-slate-100 text-slate-600 ring-slate-200">Inactiva</Badge>}
                  </div>

                  <div className="mt-auto flex items-center justify-end gap-1 border-t border-border pt-3">
                    <Button variante="ghost" tamano="sm" onClick={() => abrirEdicion(b)}>
                      <Pencil className="h-3.5 w-3.5" /> Editar
                    </Button>
                    <Button
                      variante="ghost"
                      tamano="icon"
                      onClick={() => setAEliminar(b)}
                      aria-label="Eliminar"
                      className="text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
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
        titulo={editando ? "Editar Bodega" : "Nueva Bodega"}
        descripcion="Define el código, tipo, ubicación y los proyectos que usan esta bodega."
      >
        <form onSubmit={guardar} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Código" required>
              <Input
                value={form.codigo}
                onChange={(e) => setForm({ ...form, codigo: e.target.value })}
                placeholder="BOD-CEN"
              />
            </Field>
            <Field label="Tipo" required>
              <Select
                value={form.tipo}
                onChange={(e) => setForm({ ...form, tipo: e.target.value as TipoBodega })}
              >
                {TIPOS_BODEGA.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Nombre" required>
            <Input
              value={form.nombre}
              onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              placeholder="Bodega Central"
            />
          </Field>
          <Field label="Ubicación">
            <Input
              value={form.ubicacion}
              onChange={(e) => setForm({ ...form, ubicacion: e.target.value })}
              placeholder="Av. Industrial 1234, Santiago"
            />
          </Field>

          <Field
            label="Proyectos que usan esta bodega"
            hint="Marca uno o varios. Una bodega central puede servir a todos los proyectos."
          >
            {proyectos.length === 0 ? (
              <p className="rounded-lg border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                Aún no hay proyectos creados.
              </p>
            ) : (
              <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
                {proyectos.map((p) => (
                  <label
                    key={p.id}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
                  >
                    <input
                      type="checkbox"
                      checked={form.proyectos_ids.includes(p.id)}
                      onChange={() => toggleProyecto(p.id)}
                      className="h-4 w-4 rounded border-input"
                    />
                    <span className="font-mono text-xs text-primary">{p.codigo}</span>
                    <span className="text-muted-foreground">·</span>
                    <span>{p.nombre}</span>
                  </label>
                ))}
              </div>
            )}
          </Field>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.activo}
              onChange={(e) => setForm({ ...form, activo: e.target.checked })}
              className="h-4 w-4 rounded border-input"
            />
            Bodega activa
          </label>

          <ModalFooter>
            <Button type="button" variante="outline" onClick={() => setModalAbierto(false)}>
              Cancelar
            </Button>
            <Button type="submit" cargando={guardando}>
              {editando ? "Guardar cambios" : "Crear bodega"}
            </Button>
          </ModalFooter>
        </form>
      </Modal>

      <ConfirmDialog
        abierto={!!aEliminar}
        titulo="Eliminar bodega"
        mensaje={`¿Eliminar la bodega "${aEliminar?.nombre}"? Se eliminará también su registro de stock asociado.`}
        cargando={eliminando}
        onConfirmar={eliminar}
        onCancelar={() => setAEliminar(null)}
      />

      <ConfirmDialog
        abierto={bulkConfirm}
        titulo="Eliminar seleccionadas"
        mensaje={`¿Eliminar ${msel.sel.size} bodega(s) seleccionada(s)? Se eliminará su stock asociado. Esta acción no se puede deshacer.`}
        cargando={eliminandoBulk}
        onConfirmar={eliminarSeleccionadas}
        onCancelar={() => setBulkConfirm(false)}
      />
    </div>
  );
}
