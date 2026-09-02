"use client";

import * as React from "react";
import { FileText, Plus, Trash2, Check, CircleDollarSign, Search, AlertTriangle, ScanLine, Download } from "lucide-react";
import { exportarExcel } from "@/lib/excel";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useConsulta } from "@/lib/hooks";
import { mensajeError, formatCLP, formatFecha, cn } from "@/lib/utils";
import type { Factura, Proveedor, Proyecto, Subcontrato, EstadoFactura } from "@/lib/types";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Field, Select } from "@/components/ui/field";
import { Combobox } from "@/components/ui/combobox";
import { Modal, ModalFooter } from "@/components/ui/modal";
import { ConfirmDialog } from "@/components/ui/confirm";
import { TableContainer, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { LoadingState, ErrorState, EmptyState } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { extraerDesdeArchivo } from "@/lib/extraer";

const COLOR_FACTURA: Record<EstadoFactura, string> = {
  Pendiente: "bg-amber-100 text-amber-700 ring-amber-200",
  Aprobada: "bg-blue-100 text-blue-700 ring-blue-200",
  Pagada: "bg-emerald-100 text-emerald-700 ring-emerald-200",
  Anulada: "bg-rose-100 text-rose-700 ring-rose-200",
};

type ItemDetalle = { producto: string; cantidad: string; precio_unitario: string };

const ITEM_VACIO: ItemDetalle = { producto: "", cantidad: "1", precio_unitario: "0" };

const ESCANEO_ACTIVO = process.env.NEXT_PUBLIC_ESCANEO_ACTIVO === "true";

export default function FacturasPage() {
  const toast = useToast();

  async function exportar() {
    try {
      await exportarExcel("facturas_insiso", filtradas.map((f) => ({
        numero: f.numero_factura,
        fecha: formatFecha(f.fecha),
        proveedor: mapProveedor.get(f.proveedor_id) ?? "",
        proyecto: mapProyecto.get(f.proyecto_id) ?? "",
        monto_total: f.monto_total,
        estado: f.estado,
      })), "Facturas");
      toast.exito(`Exportadas ${filtradas.length} factura(s) a Excel.`);
    } catch (err) {
      toast.error(mensajeError(err));
    }
  }
  const [filtroEstado, setFiltroEstado] = React.useState<"" | EstadoFactura>("");
  const [busqueda, setBusqueda] = React.useState("");
  const [modalAbierto, setModalAbierto] = React.useState(false);
  const [guardando, setGuardando] = React.useState(false);
  const [procesando, setProcesando] = React.useState<string | null>(null);
  const [sobregiro, setSobregiro] = React.useState<{ factura: Factura; mensaje: string } | null>(null);
  const [escaneando, setEscaneando] = React.useState(false);
  const scanInputRef = React.useRef<HTMLInputElement>(null);

  const [form, setForm] = React.useState({
    numero_factura: "",
    proveedor_id: "",
    proyecto_id: "",
    subcontrato_id: "",
    fecha: new Date().toISOString().slice(0, 10),
  });
  const [items, setItems] = React.useState<ItemDetalle[]>([{ ...ITEM_VACIO }]);

  const { datos, cargando, error, refrescar } = useConsulta(async () => {
    const sb = getSupabaseClient();
    const [facturas, proveedores, proyectos, subcontratos] = await Promise.all([
      sb.from("facturas").select("*").order("fecha", { ascending: false }).limit(300),
      sb.from("proveedores").select("id, razon_social, rut").order("razon_social"),
      sb.from("proyectos").select("id, codigo, nombre").order("codigo"),
      sb.from("subcontratos").select("id, proyecto_id, glosa, estado"),
    ]);
    if (facturas.error) throw facturas.error;
    if (proveedores.error) throw proveedores.error;
    if (proyectos.error) throw proyectos.error;
    if (subcontratos.error) throw subcontratos.error;
    return {
      facturas: facturas.data as Factura[],
      proveedores: proveedores.data as Pick<Proveedor, "id" | "razon_social" | "rut">[],
      proyectos: proyectos.data as Pick<Proyecto, "id" | "codigo" | "nombre">[],
      subcontratos: subcontratos.data as Pick<Subcontrato, "id" | "proyecto_id" | "glosa" | "estado">[],
    };
  });

  const facturas = datos?.facturas ?? [];
  const proveedores = datos?.proveedores ?? [];
  const proyectos = datos?.proyectos ?? [];
  const subcontratos = datos?.subcontratos ?? [];

  const mapProveedor = React.useMemo(() => new Map(proveedores.map((p) => [p.id, p.razon_social])), [proveedores]);
  const mapProyecto = React.useMemo(() => new Map(proyectos.map((p) => [p.id, p.codigo])), [proyectos]);
  const subcontratosProyecto = subcontratos.filter(
    (s) => s.proyecto_id === form.proyecto_id && s.estado === "Vigente"
  );

  const totalFactura = items.reduce(
    (s, it) => s + (Number(it.cantidad) || 0) * (Number(it.precio_unitario) || 0),
    0
  );

  const filtradas = facturas.filter((f) => {
    if (filtroEstado && f.estado !== filtroEstado) return false;
    const q = busqueda.toLowerCase().trim();
    if (!q) return true;
    return (
      f.numero_factura.toLowerCase().includes(q) ||
      (mapProveedor.get(f.proveedor_id) ?? "").toLowerCase().includes(q)
    );
  });

  async function onScanArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) {
      setEscaneando(true);
      try {
        const d = await extraerDesdeArchivo<{
          rut_proveedor?: string | null;
          razon_social_proveedor?: string | null;
          numero_factura?: string | null;
          fecha?: string | null;
          monto_total?: number | null;
          items?: { producto?: string | null; cantidad?: number | null; precio_unitario?: number | null }[];
        }>("factura", f);

        const norm = (x: string) => x.replace(/[^0-9kK]/g, "").toLowerCase();
        let provId = "";
        if (d.rut_proveedor) {
          const t = norm(d.rut_proveedor);
          const p = proveedores.find((x) => x.rut && norm(x.rut) === t);
          if (p) provId = p.id;
        }
        if (!provId && d.razon_social_proveedor) {
          const t = d.razon_social_proveedor.toLowerCase().trim();
          const p = proveedores.find(
            (x) => x.razon_social.toLowerCase().includes(t) || t.includes(x.razon_social.toLowerCase())
          );
          if (p) provId = p.id;
        }

        setForm({
          numero_factura: d.numero_factura ?? "",
          proveedor_id: provId,
          proyecto_id: "",
          subcontrato_id: "",
          fecha: d.fecha || new Date().toISOString().slice(0, 10),
        });
        const its = Array.isArray(d.items) ? d.items : [];
        setItems(
          its.length
            ? its.map((it) => ({
                producto: String(it.producto ?? ""),
                cantidad: String(it.cantidad ?? 1),
                precio_unitario: String(it.precio_unitario ?? 0),
              }))
            : [{ ...ITEM_VACIO }]
        );
        setModalAbierto(true);
        toast.exito(
          provId
            ? "Factura leída. Revisa los datos y selecciona el proyecto."
            : "Factura leída. Selecciona el proveedor y el proyecto (no se pudo reconocer el proveedor)."
        );
      } catch (err) {
        toast.error(mensajeError(err));
      } finally {
        setEscaneando(false);
      }
    }
    e.target.value = "";
  }

  function abrirNueva() {
    setForm({
      numero_factura: "",
      proveedor_id: "",
      proyecto_id: "",
      subcontrato_id: "",
      fecha: new Date().toISOString().slice(0, 10),
    });
    setItems([{ ...ITEM_VACIO }]);
    setModalAbierto(true);
  }

  function actualizarItem(i: number, campo: keyof ItemDetalle, valor: string) {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, [campo]: valor } : it)));
  }

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    if (!form.numero_factura.trim() || !form.proveedor_id || !form.proyecto_id) {
      toast.error("Folio, proveedor y proyecto son obligatorios.");
      return;
    }
    const detalles = items
      .filter((it) => it.producto.trim())
      .map((it) => ({
        producto: it.producto.trim(),
        cantidad: Number(it.cantidad) || 0,
        precio_unitario: Number(it.precio_unitario) || 0,
      }));
    if (detalles.length === 0) {
      toast.error("Agrega al menos un ítem al detalle.");
      return;
    }
    setGuardando(true);
    try {
      const res = await fetch("/api/facturas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          numero_factura: form.numero_factura.trim(),
          proveedor_id: form.proveedor_id,
          proyecto_id: form.proyecto_id,
          subcontrato_id: form.subcontrato_id || null,
          fecha: form.fecha,
          detalles,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "No se pudo crear la factura.");
      toast.exito("Factura creada (pendiente de aprobación).");
      setModalAbierto(false);
      refrescar();
    } catch (err) {
      toast.error(mensajeError(err));
    } finally {
      setGuardando(false);
    }
  }

  async function aprobar(f: Factura, forzar = false) {
    setProcesando(f.id);
    try {
      const res = await fetch(`/api/facturas?id=${f.id}&accion=aprobar${forzar ? "&forzar=true" : ""}`, {
        method: "PATCH",
      });
      const json = await res.json();
      if (res.status === 409 && json.sobregiro) {
        // Desviación: pedir confirmación para forzar
        setSobregiro({ factura: f, mensaje: json.error });
        return;
      }
      if (!res.ok) throw new Error(json.error || "No se pudo aprobar.");
      toast.exito(forzar ? "Factura aprobada (con sobregiro autorizado)." : "Factura aprobada.");
      setSobregiro(null);
      refrescar();
    } catch (err) {
      toast.error(mensajeError(err));
    } finally {
      setProcesando(null);
    }
  }

  async function pagar(f: Factura) {
    setProcesando(f.id);
    try {
      const res = await fetch(`/api/facturas?id=${f.id}&accion=pagar`, { method: "PATCH" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "No se pudo pagar.");
      toast.exito("Factura marcada como pagada.");
      refrescar();
    } catch (err) {
      toast.error(mensajeError(err));
    } finally {
      setProcesando(null);
    }
  }

  return (
    <div>
      <PageHeader
        titulo="Facturas"
        descripcion="Carga de facturas con detalle de ítems, aprobación y pago. Descuenta presupuesto al aprobar."
        icono={FileText}
        acciones={
          <div className="flex flex-wrap gap-2">
            <Button variante="outline" onClick={exportar} disabled={filtradas.length === 0}>
              <Download className="h-4 w-4" /> Exportar
            </Button>
            {ESCANEO_ACTIVO && (
              <Button variante="outline" onClick={() => scanInputRef.current?.click()} cargando={escaneando}>
                {!escaneando && <ScanLine className="h-4 w-4" />} Escanear
              </Button>
            )}
            <Button onClick={abrirNueva}>
              <Plus className="h-4 w-4" /> Nueva Factura
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

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative max-w-xs flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por folio o proveedor…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {(["", "Pendiente", "Aprobada", "Pagada"] as const).map((e) => (
            <Button
              key={e || "todas"}
              variante={filtroEstado === e ? "primary" : "outline"}
              tamano="sm"
              onClick={() => setFiltroEstado(e)}
            >
              {e || "Todas"}
            </Button>
          ))}
        </div>
      </div>

      {cargando ? (
        <LoadingState mensaje="Cargando facturas…" />
      ) : error ? (
        <ErrorState mensaje={error} onReintentar={refrescar} />
      ) : filtradas.length === 0 ? (
        <EmptyState
          titulo="Sin facturas"
          descripcion="Crea una factura para empezar a controlar el gasto del proyecto."
          accion={
            <Button onClick={abrirNueva}>
              <Plus className="h-4 w-4" /> Nueva Factura
            </Button>
          }
        />
      ) : (
        <TableContainer>
          <THead>
            <TR>
              <TH>Folio</TH>
              <TH>Proveedor</TH>
              <TH>Proyecto</TH>
              <TH>Tipo</TH>
              <TH className="text-right">Monto</TH>
              <TH>Fecha</TH>
              <TH className="text-center">Estado</TH>
              <TH className="text-right">Acciones</TH>
            </TR>
          </THead>
          <TBody>
            {filtradas.map((f) => (
              <TR key={f.id}>
                <TD className="font-mono text-xs font-semibold">{f.numero_factura}</TD>
                <TD className="font-medium">{mapProveedor.get(f.proveedor_id) ?? "—"}</TD>
                <TD className="text-xs text-muted-foreground">{mapProyecto.get(f.proyecto_id) ?? "—"}</TD>
                <TD>
                  {f.subcontrato_id ? (
                    <Badge color="bg-violet-100 text-violet-700 ring-violet-200">Subcontrato</Badge>
                  ) : (
                    <Badge color="bg-slate-100 text-slate-600 ring-slate-200">Directa</Badge>
                  )}
                </TD>
                <TD className="text-right font-semibold tabular-nums">{formatCLP(f.monto_total)}</TD>
                <TD className="whitespace-nowrap text-xs">{formatFecha(f.fecha)}</TD>
                <TD className="text-center">
                  <Badge color={COLOR_FACTURA[f.estado]}>{f.estado}</Badge>
                </TD>
                <TD>
                  <div className="flex items-center justify-end gap-1">
                    {f.estado === "Pendiente" && (
                      <Button
                        variante="success"
                        tamano="sm"
                        cargando={procesando === f.id}
                        onClick={() => aprobar(f)}
                      >
                        <Check className="h-3.5 w-3.5" /> Aprobar
                      </Button>
                    )}
                    {f.estado === "Aprobada" && (
                      <Button
                        variante="primary"
                        tamano="sm"
                        cargando={procesando === f.id}
                        onClick={() => pagar(f)}
                      >
                        <CircleDollarSign className="h-3.5 w-3.5" /> Pagar
                      </Button>
                    )}
                    {f.estado === "Pagada" && (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </div>
                </TD>
              </TR>
            ))}
          </TBody>
        </TableContainer>
      )}

      {/* Modal nueva factura */}
      <Modal
        abierto={modalAbierto}
        onCerrar={() => setModalAbierto(false)}
        titulo="Nueva Factura"
        descripcion="El monto total se calcula del detalle. Impactará el presupuesto al aprobarla."
        ancho="max-w-2xl"
      >
        <form onSubmit={crear} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="N° de Factura" required>
              <Input
                value={form.numero_factura}
                onChange={(e) => setForm({ ...form, numero_factura: e.target.value })}
                placeholder="F-12345"
              />
            </Field>
            <Field label="Fecha" required>
              <Input
                type="date"
                value={form.fecha}
                onChange={(e) => setForm({ ...form, fecha: e.target.value })}
              />
            </Field>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Proveedor" required>
              <Combobox
                value={form.proveedor_id}
                onChange={(id) => setForm({ ...form, proveedor_id: id })}
                placeholder="Escribe para buscar proveedor…"
                items={proveedores.map((p) => ({ id: p.id, label: p.razon_social, buscar: p.razon_social }))}
              />
            </Field>
            <Field label="Proyecto" required>
              <Combobox
                value={form.proyecto_id}
                onChange={(id) => setForm({ ...form, proyecto_id: id, subcontrato_id: "" })}
                placeholder="Escribe para buscar proyecto…"
                items={proyectos.map((p) => ({ id: p.id, label: `${p.codigo} · ${p.nombre}`, buscar: `${p.codigo} ${p.nombre}` }))}
              />
            </Field>
          </div>
          <Field
            label="Subcontrato (opcional)"
            hint="Si la factura corresponde a un subcontrato, el gasto se imputa a su ejecución (sin duplicar)."
          >
            <Select
              value={form.subcontrato_id}
              onChange={(e) => setForm({ ...form, subcontrato_id: e.target.value })}
              disabled={!form.proyecto_id}
            >
              <option value="">— Factura directa (sin subcontrato) —</option>
              {subcontratosProyecto.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.glosa}
                </option>
              ))}
            </Select>
          </Field>

          {/* Detalle de ítems */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-sm font-medium">Detalle de ítems</label>
              <Button
                type="button"
                variante="outline"
                tamano="sm"
                onClick={() => setItems((p) => [...p, { ...ITEM_VACIO }])}
              >
                <Plus className="h-3.5 w-3.5" /> Agregar ítem
              </Button>
            </div>
            <div className="space-y-2">
              {items.map((it, i) => {
                const subtotal = (Number(it.cantidad) || 0) * (Number(it.precio_unitario) || 0);
                return (
                  <div key={i} className="grid grid-cols-12 items-center gap-2">
                    <Input
                      className="col-span-5"
                      placeholder="Producto / ítem"
                      value={it.producto}
                      onChange={(e) => actualizarItem(i, "producto", e.target.value)}
                    />
                    <Input
                      className="col-span-2"
                      type="number"
                      min="0"
                      step="any"
                      placeholder="Cant."
                      value={it.cantidad}
                      onChange={(e) => actualizarItem(i, "cantidad", e.target.value)}
                    />
                    <Input
                      className="col-span-2"
                      type="number"
                      min="0"
                      step="1"
                      placeholder="Precio"
                      value={it.precio_unitario}
                      onChange={(e) => actualizarItem(i, "precio_unitario", e.target.value)}
                    />
                    <span className="col-span-2 text-right text-xs tabular-nums text-muted-foreground">
                      {formatCLP(subtotal)}
                    </span>
                    <button
                      type="button"
                      onClick={() => setItems((p) => (p.length > 1 ? p.filter((_, idx) => idx !== i) : p))}
                      className="col-span-1 flex justify-center text-muted-foreground hover:text-destructive"
                      aria-label="Quitar ítem"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}
            </div>
            <div className="mt-3 flex items-center justify-end gap-2 border-t border-border pt-3">
              <span className="text-sm text-muted-foreground">Total factura:</span>
              <span className="text-lg font-bold tabular-nums">{formatCLP(totalFactura)}</span>
            </div>
          </div>

          <ModalFooter>
            <Button type="button" variante="outline" onClick={() => setModalAbierto(false)}>
              Cancelar
            </Button>
            <Button type="submit" cargando={guardando}>
              Crear factura
            </Button>
          </ModalFooter>
        </form>
      </Modal>

      {/* Alerta de sobregiro al aprobar */}
      <Modal
        abierto={!!sobregiro}
        onCerrar={() => setSobregiro(null)}
        titulo="Alerta de desviación presupuestaria"
        ancho="max-w-md"
      >
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <p>{sobregiro?.mensaje}</p>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          ¿Deseas aprobar la factura de todas formas? Quedará registrado el sobregiro.
        </p>
        <ModalFooter>
          <Button variante="outline" onClick={() => setSobregiro(null)}>
            Cancelar
          </Button>
          <Button
            variante="destructive"
            cargando={procesando === sobregiro?.factura.id}
            onClick={() => sobregiro && aprobar(sobregiro.factura, true)}
          >
            Aprobar con sobregiro
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
