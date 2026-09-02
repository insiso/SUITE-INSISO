"use client";

import * as React from "react";
import { Building2, Plus, Trash2, Search, Mail, Phone, CheckCircle2, XCircle, Upload, Download, ScanLine, MapPin } from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useConsulta } from "@/lib/hooks";
import { mensajeError, formatRut, validarRut, formatFecha } from "@/lib/utils";
import type { Proveedor, EvaluacionProveedor } from "@/lib/types";
import { TIPOS_PAGO } from "@/lib/constants";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Field, Select, Textarea } from "@/components/ui/field";
import { Modal, ModalFooter } from "@/components/ui/modal";
import { ConfirmDialog } from "@/components/ui/confirm";
import { TableContainer, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { LoadingState, ErrorState, EmptyState } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { exportarExcel, descargarPlantilla, leerExcel, valorCampo } from "@/lib/excel";
import { extraerDesdeArchivo } from "@/lib/extraer";
import { useMultiSeleccion, BotonSeleccionar, BarraSeleccion, CasillaFila } from "@/components/ui/multiseleccion";

const FORM_VACIO = {
  rut: "",
  razon_social: "",
  contacto: "",
  email: "",
  telefono: "",
  categoria: "",
  direccion: "",
  tipo_pago: "",
};

const ESCANEO_ACTIVO = process.env.NEXT_PUBLIC_ESCANEO_ACTIVO === "true";

function trimestreActual(): string {
  const d = new Date();
  return `${d.getFullYear()}-T${Math.floor(d.getMonth() / 3) + 1}`;
}

export default function ProveedoresPage() {
  const toast = useToast();
  const [busqueda, setBusqueda] = React.useState("");
  const [orden, setOrden] = React.useState<"az" | "za">("az");
  const [modalAbierto, setModalAbierto] = React.useState(false);
  const [form, setForm] = React.useState(FORM_VACIO);
  const [guardando, setGuardando] = React.useState(false);
  const [aEliminar, setAEliminar] = React.useState<Proveedor | null>(null);
  const [eliminando, setEliminando] = React.useState(false);

  // Importar / Exportar Excel
  const [importarAbierto, setImportarAbierto] = React.useState(false);
  const [filasImport, setFilasImport] = React.useState<Record<string, unknown>[] | null>(null);
  const [nombreArchivo, setNombreArchivo] = React.useState("");
  const [importando, setImportando] = React.useState(false);
  const [escaneando, setEscaneando] = React.useState(false);
  const scanInputRef = React.useRef<HTMLInputElement>(null);
  const msel = useMultiSeleccion();
  const [bulkConfirm, setBulkConfirm] = React.useState(false);
  const [eliminandoBulk, setEliminandoBulk] = React.useState(false);

  // Evaluación de proveedor
  const [evaluando, setEvaluando] = React.useState<Proveedor | null>(null);
  const [evalForm, setEvalForm] = React.useState({
    periodo: "",
    entrega: "",
    calidad: "",
    precio: "",
    distancia: "",
    tipo_pago: "",
    comentario: "",
  });
  const [guardandoEval, setGuardandoEval] = React.useState(false);
  const [verHistorial, setVerHistorial] = React.useState<Proveedor | null>(null);

  const { datos, cargando, error, refrescar } = useConsulta(async () => {
    const sb = getSupabaseClient();
    const [prov, evals] = await Promise.all([
      sb.from("proveedores").select("*").order("razon_social"),
      sb.from("evaluaciones_proveedor").select("*").order("fecha", { ascending: false }),
    ]);
    if (prov.error) throw prov.error;
    // La tabla de evaluaciones puede no existir aún (antes de la migración); no romper la página.
    return {
      proveedores: prov.data as Proveedor[],
      evaluaciones: (evals.data ?? []) as EvaluacionProveedor[],
    };
  });

  const proveedores = datos?.proveedores ?? [];
  const evaluaciones = datos?.evaluaciones ?? [];
  const evalsPorProveedor = React.useMemo(() => {
    const m = new Map<string, EvaluacionProveedor[]>();
    for (const e of evaluaciones) {
      const arr = m.get(e.proveedor_id) ?? [];
      arr.push(e);
      m.set(e.proveedor_id, arr);
    }
    return m;
  }, [evaluaciones]);
  const filtrados = proveedores
    .filter((p) => {
      const q = busqueda.toLowerCase().trim();
      if (!q) return true;
      return (
        p.razon_social.toLowerCase().includes(q) ||
        p.rut.toLowerCase().includes(q) ||
        (p.categoria ?? "").toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      const cmp = a.razon_social.localeCompare(b.razon_social, "es", { sensitivity: "base" });
      return orden === "za" ? -cmp : cmp;
    });

  const rutValido = !form.rut || validarRut(form.rut);

  function abrirEval(p: Proveedor) {
    setEvaluando(p);
    setEvalForm({ periodo: trimestreActual(), entrega: "", calidad: "", precio: "", distancia: "", tipo_pago: "", comentario: "" });
  }

  async function registrarEval(e: React.FormEvent) {
    e.preventDefault();
    if (!evaluando) return;
    const claves = ["entrega", "calidad", "precio", "distancia", "tipo_pago"] as const;
    const valores = claves.map((c) => Number(evalForm[c]));
    if (valores.some((v) => Number.isNaN(v) || v < 0 || v > 100))
      return toast.error("Cada criterio debe ser un número de 0 a 100.");
    const promedio = Math.round((valores.reduce((a, b) => a + b, 0) / valores.length) * 100) / 100;
    setGuardandoEval(true);
    try {
      const sb = getSupabaseClient();
      const { error } = await sb.from("evaluaciones_proveedor").insert({
        proveedor_id: evaluando.id,
        periodo: evalForm.periodo.trim() || trimestreActual(),
        entrega: valores[0],
        calidad: valores[1],
        precio: valores[2],
        distancia: valores[3],
        tipo_pago: valores[4],
        promedio,
        comentario: evalForm.comentario.trim() || null,
      });
      if (error) throw error;
      toast.exito(`Evaluación guardada. Promedio: ${promedio}%`);
      setEvaluando(null);
      refrescar();
    } catch (err) {
      toast.error(mensajeError(err));
    } finally {
      setGuardandoEval(false);
    }
  }

  async function onScanArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) {
      setEscaneando(true);
      try {
        const d = await extraerDesdeArchivo<{
          rut?: string | null;
          razon_social?: string | null;
          contacto?: string | null;
          email?: string | null;
          telefono?: string | null;
          categoria?: string | null;
          direccion?: string | null;
        }>("proveedor", f);
        setForm({
          rut: d.rut ?? "",
          razon_social: d.razon_social ?? "",
          contacto: d.contacto ?? "",
          email: d.email ?? "",
          telefono: d.telefono ?? "",
          categoria: d.categoria ?? "",
          direccion: d.direccion ?? "",
          tipo_pago: "",
        });
        setModalAbierto(true);
        toast.exito("Datos leídos del documento. Revísalos y guarda.");
      } catch (err) {
        toast.error(mensajeError(err));
      } finally {
        setEscaneando(false);
      }
    }
    e.target.value = "";
  }

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    if (!form.rut.trim() || !form.razon_social.trim()) {
      toast.error("RUT y Razón Social son obligatorios.");
      return;
    }
    if (!validarRut(form.rut)) {
      toast.error("El RUT no es válido. Ej: 76.123.456-7");
      return;
    }
    setGuardando(true);
    try {
      const res = await fetch("/api/proveedores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "No se pudo crear el proveedor.");
      toast.exito("Proveedor creado correctamente.");
      setModalAbierto(false);
      setForm(FORM_VACIO);
      refrescar();
    } catch (err) {
      toast.error(mensajeError(err));
    } finally {
      setGuardando(false);
    }
  }

  async function exportar() {
    try {
      await exportarExcel(
        "proveedores_insiso",
        proveedores.map((p) => ({
          rut: p.rut,
          razon_social: p.razon_social,
          categoria: p.categoria ?? "",
          direccion: p.direccion ?? "",
          contacto: p.contacto ?? "",
          email: p.email ?? "",
          telefono: p.telefono ?? "",
          activo: p.activo ? "Sí" : "No",
        })),
        "Proveedores"
      );
      toast.exito(`Exportados ${proveedores.length} proveedor(es) a Excel.`);
    } catch (err) {
      toast.error(mensajeError(err));
    }
  }

  async function plantillaProveedores() {
    try {
      await descargarPlantilla(
        "plantilla_proveedores",
        [
          {
            rut: "76.123.456-7",
            razon_social: "Comercial Los Andes SpA",
            categoria: "Materiales",
            direccion: "Av. Industrial 1234, Antofagasta",
            contacto: "Juan Pérez",
            email: "ventas@losandes.cl",
            telefono: "+56 9 1234 5678",
          },
        ],
        "Proveedores"
      );
    } catch (err) {
      toast.error(mensajeError(err));
    }
  }

  async function onArchivoImport(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setNombreArchivo(f.name);
    try {
      const filas = await leerExcel(f);
      setFilasImport(filas);
    } catch (err) {
      toast.error(mensajeError(err));
      setFilasImport(null);
    }
  }

  async function confirmarImport() {
    if (!filasImport || filasImport.length === 0) {
      toast.error("El archivo no tiene filas.");
      return;
    }
    const sb = getSupabaseClient();
    let creadas = 0;
    let saltadas = 0;
    let rutInvalido = 0;
    let errores = 0;
    setImportando(true);
    try {
      for (const fila of filasImport) {
        const rut = valorCampo(fila, "rut", "r.u.t");
        const razon = valorCampo(fila, "razon_social", "razon social", "razón social", "razonsocial", "nombre");
        if (!rut || !razon) {
          saltadas++;
          continue;
        }
        if (!validarRut(rut)) {
          rutInvalido++;
          continue;
        }
        const payload = {
          rut,
          razon_social: razon,
          categoria: valorCampo(fila, "categoria", "categoría", "rubro") || null,
          direccion: valorCampo(fila, "direccion", "dirección") || null,
          contacto: valorCampo(fila, "contacto", "nombre contacto") || null,
          email: valorCampo(fila, "email", "correo", "e-mail") || null,
          telefono: valorCampo(fila, "telefono", "teléfono", "fono", "celular") || null,
          activo: true,
        };
        const { error } = await sb.from("proveedores").insert(payload);
        if (error) errores++;
        else creadas++;
      }
      let msg = `${creadas} proveedor(es) importado(s).`;
      if (saltadas) msg += ` ${saltadas} omitido(s) por datos faltantes.`;
      if (rutInvalido) msg += ` ${rutInvalido} con RUT inválido.`;
      if (errores) msg += ` ${errores} con error (¿RUT duplicado?).`;
      toast.exito(msg);
      setImportarAbierto(false);
      setFilasImport(null);
      setNombreArchivo("");
      refrescar();
    } finally {
      setImportando(false);
    }
  }

  async function desactivarSeleccionados() {
    const ids = Array.from(msel.sel);
    if (ids.length === 0) return;
    setEliminandoBulk(true);
    const sb = getSupabaseClient();
    const { error } = await sb.from("proveedores").update({ activo: false }).in("id", ids);
    if (error) toast.error(mensajeError(error));
    else toast.exito(`${ids.length} proveedor(es) desactivado(s).`);
    setEliminandoBulk(false);
    msel.salir();
    refrescar();
  }

  async function eliminarSeleccionados() {
    const ids = Array.from(msel.sel);
    if (ids.length === 0) return;
    setEliminandoBulk(true);
    const sb = getSupabaseClient();
    let ok = 0;
    let fail = 0;
    for (const id of ids) {
      const { error } = await sb.from("proveedores").delete().eq("id", id);
      if (error) fail++;
      else ok++;
    }
    toast.exito(`${ok} eliminado(s).` + (fail ? ` ${fail} no se pudo(n) (con facturas/subcontratos).` : ""));
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
      const { error } = await sb.from("proveedores").delete().eq("id", aEliminar.id);
      if (error) throw error;
      toast.exito("Proveedor eliminado.");
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
        titulo="Proveedores"
        descripcion="Maestro de proveedores con validación de RUT chileno."
        icono={Building2}
        acciones={
          <div className="flex flex-wrap gap-2">
            {ESCANEO_ACTIVO && (
              <Button variante="outline" onClick={() => scanInputRef.current?.click()} cargando={escaneando}>
                {!escaneando && <ScanLine className="h-4 w-4" />} Escanear
              </Button>
            )}
            <Button variante="outline" onClick={() => setImportarAbierto(true)}>
              <Upload className="h-4 w-4" /> Importar
            </Button>
            <Button variante="outline" onClick={exportar} disabled={proveedores.length === 0}>
              <Download className="h-4 w-4" /> Exportar
            </Button>
            <BotonSeleccionar modo={msel.modo} onClick={() => (msel.modo ? msel.salir() : msel.setModo(true))} />
            <Button onClick={() => setModalAbierto(true)}>
              <Plus className="h-4 w-4" /> Nuevo Proveedor
            </Button>
          </div>
        }
      />

      <input
        ref={scanInputRef}
        type="file"
        accept="image/*,.pdf"
        capture="environment"
        className="hidden"
        onChange={onScanArchivo}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1 max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por razón social, RUT o categoría…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={orden} onChange={(e) => setOrden(e.target.value as "az" | "za")} className="h-10 w-auto">
          <option value="az">A → Z</option>
          <option value="za">Z → A</option>
        </Select>
      </div>

      {msel.modo && (
        <BarraSeleccion
          total={filtrados.length}
          cantidad={msel.sel.size}
          todosMarcados={filtrados.length > 0 && filtrados.every((p) => msel.sel.has(p.id))}
          onTodos={() => msel.seleccionarTodos(filtrados.map((p) => p.id))}
          onEliminar={() => setBulkConfirm(true)}
          onDesactivar={desactivarSeleccionados}
        />
      )}

      {cargando ? (
        <LoadingState mensaje="Cargando proveedores…" />
      ) : error ? (
        <ErrorState mensaje={error} onReintentar={refrescar} />
      ) : filtrados.length === 0 ? (
        <EmptyState
          titulo={busqueda ? "Sin resultados" : "Aún no hay proveedores"}
          descripcion={busqueda ? "Prueba con otro término." : "Crea tu primer proveedor."}
          accion={
            !busqueda && (
              <Button onClick={() => setModalAbierto(true)}>
                <Plus className="h-4 w-4" /> Nuevo Proveedor
              </Button>
            )
          }
        />
      ) : (
        <TableContainer>
          <THead>
            <TR>
              {msel.modo && <TH className="w-8"></TH>}
              <TH>RUT</TH>
              <TH>Razón Social</TH>
              <TH>Categoría</TH>
              <TH>Contacto</TH>
              <TH>Tipo de pago</TH>
              <TH className="text-center">Evaluación</TH>
              <TH className="text-center">Estado</TH>
              <TH className="text-right">Acciones</TH>
            </TR>
          </THead>
          <TBody>
            {filtrados.map((p) => (
              <TR key={p.id}>
                {msel.modo && (
                  <TD>
                    <CasillaFila marcado={msel.sel.has(p.id)} onChange={() => msel.toggle(p.id)} />
                  </TD>
                )}
                <TD className="font-mono text-xs">{formatRut(p.rut)}</TD>
                <TD className="font-medium">{p.razon_social}</TD>
                <TD className="text-muted-foreground">{p.categoria ?? "—"}</TD>
                <TD className="text-xs text-muted-foreground">
                  {p.direccion && (
                    <div className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" /> {p.direccion}
                    </div>
                  )}
                  {p.contacto && <div>{p.contacto}</div>}
                  {p.email && (
                    <div className="flex items-center gap-1">
                      <Mail className="h-3 w-3" /> {p.email}
                    </div>
                  )}
                  {p.telefono && (
                    <div className="flex items-center gap-1">
                      <Phone className="h-3 w-3" /> {p.telefono}
                    </div>
                  )}
                  {!p.contacto && !p.email && !p.telefono && !p.direccion && "—"}
                </TD>
                <TD className="text-xs">{p.tipo_pago ?? "—"}</TD>
                <TD className="text-center">
                  {(() => {
                    const ult = evalsPorProveedor.get(p.id)?.[0];
                    if (!ult) return <span className="text-xs text-muted-foreground">—</span>;
                    const c =
                      ult.promedio >= 70
                        ? "bg-emerald-100 text-emerald-700 ring-emerald-200"
                        : ult.promedio >= 50
                          ? "bg-amber-100 text-amber-700 ring-amber-200"
                          : "bg-rose-100 text-rose-700 ring-rose-200";
                    return <Badge color={c}>{ult.promedio}%</Badge>;
                  })()}
                </TD>
                <TD className="text-center">
                  {p.activo ? (
                    <Badge color="bg-emerald-100 text-emerald-700 ring-emerald-200">Activo</Badge>
                  ) : (
                    <Badge color="bg-slate-100 text-slate-600 ring-slate-200">Inactivo</Badge>
                  )}
                </TD>
                <TD>
                  <div className="flex items-center justify-end gap-1">
                    <Button variante="ghost" tamano="sm" onClick={() => abrirEval(p)} className="text-sky-600 hover:bg-sky-50">
                      Evaluar
                    </Button>
                    <Button variante="ghost" tamano="sm" onClick={() => setVerHistorial(p)}>
                      Historial
                    </Button>
                    <Button
                      variante="ghost"
                      tamano="icon"
                      onClick={() => setAEliminar(p)}
                      aria-label="Eliminar"
                      className="text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TD>
              </TR>
            ))}
          </TBody>
        </TableContainer>
      )}

      {/* Modal Evaluar proveedor */}
      <Modal
        abierto={!!evaluando}
        onCerrar={() => setEvaluando(null)}
        titulo="Evaluar proveedor"
        descripcion="Califica de 0 a 100 cada criterio. Se guarda con el promedio del período."
        ancho="max-w-lg"
      >
        <form onSubmit={registrarEval} className="space-y-4">
          <div className="rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm">
            <span className="font-medium">{evaluando?.razon_social}</span>
            <span className="text-muted-foreground"> · {evaluando?.rut}</span>
          </div>
          <Field label="Período" hint="Ej. 2026-T1 (trimestre)">
            <Input value={evalForm.periodo} onChange={(e) => setEvalForm((ff) => ({ ...ff, periodo: e.target.value }))} />
          </Field>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {(
              [
                ["entrega", "Entrega"],
                ["calidad", "Calidad"],
                ["precio", "Precio"],
                ["distancia", "Distancia"],
                ["tipo_pago", "Tipo de pago"],
              ] as const
            ).map(([k, label]) => (
              <Field key={k} label={`${label} (0-100)`}>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={evalForm[k]}
                  onChange={(e) => setEvalForm((ff) => ({ ...ff, [k]: e.target.value }))}
                  placeholder="0"
                />
              </Field>
            ))}
          </div>
          <Field label="Comentario (opcional)">
            <Textarea
              value={evalForm.comentario}
              onChange={(e) => setEvalForm((ff) => ({ ...ff, comentario: e.target.value }))}
              placeholder="Observaciones del período…"
            />
          </Field>
          <ModalFooter>
            <Button type="button" variante="outline" onClick={() => setEvaluando(null)}>
              Cancelar
            </Button>
            <Button type="submit" cargando={guardandoEval}>
              Guardar evaluación
            </Button>
          </ModalFooter>
        </form>
      </Modal>

      {/* Modal Historial de evaluaciones */}
      <Modal
        abierto={!!verHistorial}
        onCerrar={() => setVerHistorial(null)}
        titulo="Historial de evaluaciones"
        descripcion={verHistorial?.razon_social}
        ancho="max-w-2xl"
      >
        {(() => {
          const lista = verHistorial ? evalsPorProveedor.get(verHistorial.id) ?? [] : [];
          if (lista.length === 0)
            return <p className="text-sm text-muted-foreground">Aún no hay evaluaciones para este proveedor.</p>;
          return (
            <TableContainer>
              <THead>
                <TR>
                  <TH>Período</TH>
                  <TH>Fecha</TH>
                  <TH className="text-right">Entrega</TH>
                  <TH className="text-right">Calidad</TH>
                  <TH className="text-right">Precio</TH>
                  <TH className="text-right">Distancia</TH>
                  <TH className="text-right">T. Pago</TH>
                  <TH className="text-right">Promedio</TH>
                </TR>
              </THead>
              <TBody>
                {lista.map((ev) => (
                  <TR key={ev.id}>
                    <TD>{ev.periodo ?? "—"}</TD>
                    <TD className="text-xs">{formatFecha(ev.fecha)}</TD>
                    <TD className="text-right">{ev.entrega}</TD>
                    <TD className="text-right">{ev.calidad}</TD>
                    <TD className="text-right">{ev.precio}</TD>
                    <TD className="text-right">{ev.distancia}</TD>
                    <TD className="text-right">{ev.tipo_pago}</TD>
                    <TD className="text-right font-semibold">{ev.promedio}%</TD>
                  </TR>
                ))}
              </TBody>
            </TableContainer>
          );
        })()}
      </Modal>

      <Modal
        abierto={modalAbierto}
        onCerrar={() => setModalAbierto(false)}
        titulo="Nuevo Proveedor"
        descripcion="El RUT se valida automáticamente (formato chileno)."
        ancho="max-w-md"
      >
        <form onSubmit={crear} className="space-y-4">
          <Field
            label="RUT"
            required
            error={!rutValido ? "RUT inválido. Ej: 76.123.456-7" : undefined}
            hint={rutValido && form.rut ? "RUT válido ✓" : "Con guión y dígito verificador"}
          >
            <div className="relative">
              <Input
                value={form.rut}
                onChange={(e) => setForm({ ...form, rut: e.target.value })}
                placeholder="76.123.456-7"
                className={!rutValido ? "border-destructive pr-9" : "pr-9"}
              />
              {form.rut && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2">
                  {rutValido ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <XCircle className="h-4 w-4 text-destructive" />
                  )}
                </span>
              )}
            </div>
          </Field>
          <Field label="Razón Social" required>
            <Input
              value={form.razon_social}
              onChange={(e) => setForm({ ...form, razon_social: e.target.value })}
              placeholder="Comercial Los Andes SpA"
            />
          </Field>
          <Field label="Dirección">
            <Input
              value={form.direccion}
              onChange={(e) => setForm({ ...form, direccion: e.target.value })}
              placeholder="Av. Industrial 1234, Antofagasta"
            />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Categoría">
              <Input
                value={form.categoria}
                onChange={(e) => setForm({ ...form, categoria: e.target.value })}
                placeholder="Materiales, Áridos…"
              />
            </Field>
            <Field label="Contacto">
              <Input
                value={form.contacto}
                onChange={(e) => setForm({ ...form, contacto: e.target.value })}
                placeholder="Nombre del contacto"
              />
            </Field>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Email">
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="ventas@proveedor.cl"
              />
            </Field>
            <Field label="Teléfono">
              <Input
                value={form.telefono}
                onChange={(e) => setForm({ ...form, telefono: e.target.value })}
                placeholder="+56 9 1234 5678"
              />
            </Field>
          </div>
          <Field label="Tipo de pago">
            <Select value={form.tipo_pago} onChange={(e) => setForm({ ...form, tipo_pago: e.target.value })}>
              <option value="">— Selecciona —</option>
              {TIPOS_PAGO.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </Field>
          <ModalFooter>
            <Button type="button" variante="outline" onClick={() => setModalAbierto(false)}>
              Cancelar
            </Button>
            <Button type="submit" cargando={guardando} disabled={!rutValido}>
              Crear proveedor
            </Button>
          </ModalFooter>
        </form>
      </Modal>

      {/* Modal importar Excel */}
      <Modal
        abierto={importarAbierto}
        onCerrar={() => {
          setImportarAbierto(false);
          setFilasImport(null);
          setNombreArchivo("");
        }}
        titulo="Importar proveedores desde Excel"
        descripcion="Carga masiva. Descarga la plantilla para ver las columnas."
        ancho="max-w-lg"
      >
        <div className="space-y-4">
          <div className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            Columnas: <b>rut</b>, <b>razon_social</b>, categoria, contacto, email, telefono.
            Obligatorias: <b>rut</b> y <b>razon_social</b>. El RUT se valida (formato chileno).
          </div>
          <Button type="button" variante="outline" tamano="sm" onClick={plantillaProveedores}>
            <Download className="h-4 w-4" /> Descargar plantilla
          </Button>
          <div>
            <label className="mb-1 block text-sm font-medium">Archivo Excel (.xlsx)</label>
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={onArchivoImport}
              className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary-foreground hover:file:opacity-90"
            />
          </div>
          {filasImport && (
            <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
              Detectadas <b>{filasImport.length}</b> fila(s) en “{nombreArchivo}”.
            </p>
          )}
          <ModalFooter>
            <Button
              type="button"
              variante="outline"
              onClick={() => {
                setImportarAbierto(false);
                setFilasImport(null);
                setNombreArchivo("");
              }}
            >
              Cancelar
            </Button>
            <Button type="button" onClick={confirmarImport} cargando={importando} disabled={!filasImport?.length}>
              <Upload className="h-4 w-4" /> Importar
            </Button>
          </ModalFooter>
        </div>
      </Modal>

      <ConfirmDialog
        abierto={!!aEliminar}
        titulo="Eliminar proveedor"
        mensaje={`¿Eliminar a "${aEliminar?.razon_social}"? No podrás eliminarlo si tiene facturas o subcontratos asociados.`}
        cargando={eliminando}
        onConfirmar={eliminar}
        onCancelar={() => setAEliminar(null)}
      />

      <ConfirmDialog
        abierto={bulkConfirm}
        titulo="Eliminar seleccionados"
        mensaje={`¿Eliminar ${msel.sel.size} proveedor(es) seleccionado(s)? No se podrán eliminar los que tengan facturas o subcontratos.`}
        cargando={eliminandoBulk}
        onConfirmar={eliminarSeleccionados}
        onCancelar={() => setBulkConfirm(false)}
      />
    </div>
  );
}
