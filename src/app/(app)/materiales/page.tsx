"use client";

import * as React from "react";
import { Package, Plus, Pencil, Trash2, Search, MinusCircle, Upload, Download, ScanLine } from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useConsulta } from "@/lib/hooks";
import { mensajeError, formatCLP, formatNumero } from "@/lib/utils";
import type { Material, Bodega, Proyecto, BodegaProyecto } from "@/lib/types";
import { UNIDADES_MEDIDA, SEGMENTOS_MATERIAL } from "@/lib/constants";
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

type ProyectoMini = Pick<Proyecto, "id" | "codigo" | "nombre">;

type FormState = {
  sku: string;
  descripcion: string;
  categoria: string;
  segmento: string;
  unidad_medida: string;
  precio_unitario: string;
  stock_minimo: string;
  activo: boolean;
  stock_inicial: string;
  bodega_inicial_id: string;
};

const FORM_VACIO: FormState = {
  sku: "",
  descripcion: "",
  categoria: "",
  segmento: "Construcción",
  unidad_medida: "un",
  precio_unitario: "0",
  stock_minimo: "0",
  activo: true,
  stock_inicial: "0",
  bodega_inicial_id: "",
};

// Prefijo de SKU por segmento (continuación inteligente)
const PREFIJO_SKU: Record<string, string> = {
  "Construcción": "CON",
  "Aseo": "ASE",
  "Oficina": "OFI",
  "EPP": "EPP",
  "Eléctricos": "ELE",
  "Otros": "OTR",
};

/** Devuelve el siguiente SKU disponible para un segmento (ej. CON-0043). */
function siguienteSku(materiales: Material[], segmento: string): string {
  const pref = PREFIJO_SKU[segmento] ?? "MAT";
  const re = new RegExp(`^${pref}-(\\d+)$`, "i");
  let max = 0;
  for (const m of materiales) {
    const mm = re.exec((m.sku ?? "").trim());
    if (mm) max = Math.max(max, parseInt(mm[1], 10));
  }
  return `${pref}-${String(max + 1).padStart(4, "0")}`;
}

// --- Consumo de material (SALIDA imputada a un proyecto activo) --------------
type ConsumoState = {
  bodega_origen_id: string;
  cantidad: string;
  proyecto_id: string;
  concepto: string;
};

const CONSUMO_VACIO: ConsumoState = {
  bodega_origen_id: "",
  cantidad: "",
  proyecto_id: "",
  concepto: "",
};

const ESCANEO_ACTIVO = process.env.NEXT_PUBLIC_ESCANEO_ACTIVO === "true";

const COLOR_SEGMENTO: Record<string, string> = {
  "Construcción": "bg-amber-100 text-amber-700 ring-amber-200",
  Aseo: "bg-sky-100 text-sky-700 ring-sky-200",
  Oficina: "bg-violet-100 text-violet-700 ring-violet-200",
  EPP: "bg-emerald-100 text-emerald-700 ring-emerald-200",
  "Eléctricos": "bg-orange-100 text-orange-700 ring-orange-200",
  Otros: "bg-slate-100 text-slate-600 ring-slate-200",
};

export default function MaterialesPage() {
  const toast = useToast();
  const [busqueda, setBusqueda] = React.useState("");
  const [modalAbierto, setModalAbierto] = React.useState(false);
  const [editando, setEditando] = React.useState<Material | null>(null);
  const [form, setForm] = React.useState<FormState>(FORM_VACIO);
  const [guardando, setGuardando] = React.useState(false);
  const [aEliminar, setAEliminar] = React.useState<Material | null>(null);
  const [eliminando, setEliminando] = React.useState(false);

  // Consumo
  const [consumiendo, setConsumiendo] = React.useState<Material | null>(null);
  const [consumo, setConsumo] = React.useState<ConsumoState>(CONSUMO_VACIO);
  const [registrandoConsumo, setRegistrandoConsumo] = React.useState(false);

  // Ajuste de stock
  const [ajustando, setAjustando] = React.useState<Material | null>(null);
  const [ajuste, setAjuste] = React.useState<{ bodega_id: string; nueva_cantidad: string }>({
    bodega_id: "",
    nueva_cantidad: "",
  });
  const [guardandoAjuste, setGuardandoAjuste] = React.useState(false);

  // Importar / Exportar Excel
  const [importarAbierto, setImportarAbierto] = React.useState(false);
  const [filasImport, setFilasImport] = React.useState<Record<string, unknown>[] | null>(null);
  const [nombreArchivo, setNombreArchivo] = React.useState("");
  const [importando, setImportando] = React.useState(false);
  const [escaneando, setEscaneando] = React.useState(false);
  const scanInputRef = React.useRef<HTMLInputElement>(null);
  const [segmentoTab, setSegmentoTab] = React.useState<string>("Todos");
  const [orden, setOrden] = React.useState<"az" | "za" | "sku">("az");
  const [estadoTab, setEstadoTab] = React.useState<"Todos" | "Activos" | "Inactivos">("Todos");
  const [segmentoImport, setSegmentoImport] = React.useState("Construcción");
  const [bodegaImport, setBodegaImport] = React.useState("");
  const msel = useMultiSeleccion();
  const [bulkConfirm, setBulkConfirm] = React.useState(false);
  const [eliminandoBulk, setEliminandoBulk] = React.useState(false);

  const { datos, cargando, error, refrescar } = useConsulta(async () => {
    const sb = getSupabaseClient();
    const {
      data: { user },
    } = await sb.auth.getUser();
    const perfil = user
      ? await sb.from("usuarios").select("rol").eq("auth_user_id", user.id).maybeSingle()
      : { data: null };
    const rol = (perfil.data as { rol?: string } | null)?.rol ?? null;
    const esAdmin = rol === "Administrador";
    // Roles logísticos que pueden crear/eliminar materiales
    const puedeEliminar = rol === "Administrador" || rol === "Bodeguero";
    const [materiales, bodegas, proyectos, stock, vinculos] = await Promise.all([
      sb.from("materiales").select("*").order("sku"),
      sb.from("bodegas").select("id, codigo, nombre").eq("activo", true).order("codigo"),
      sb
        .from("proyectos")
        .select("id, codigo, nombre")
        .eq("estado", "Activo")
        .order("codigo"),
      sb.from("inventario_stock").select("material_id, bodega_id, cantidad"),
      sb.from("bodega_proyectos").select("bodega_id, proyecto_id"),
    ]);
    if (materiales.error) throw materiales.error;
    if (bodegas.error) throw bodegas.error;
    if (proyectos.error) throw proyectos.error;
    if (stock.error) throw stock.error;
    if (vinculos.error) throw vinculos.error;
    return {
      materiales: materiales.data as Material[],
      bodegas: (bodegas.data ?? []) as Pick<Bodega, "id" | "codigo" | "nombre">[],
      proyectos: (proyectos.data ?? []) as ProyectoMini[],
      stock: (stock.data ?? []) as { material_id: string; bodega_id: string; cantidad: number }[],
      vinculos: (vinculos.data ?? []) as Pick<BodegaProyecto, "bodega_id" | "proyecto_id">[],
      esAdmin,
      puedeEliminar,
    };
  });

  const materiales = datos?.materiales ?? [];
  const bodegas = datos?.bodegas ?? [];
  const proyectosActivos = datos?.proyectos ?? [];
  const stock = datos?.stock ?? [];
  const vinculos = datos?.vinculos ?? [];
  const esAdmin = datos?.esAdmin ?? false;
  const puedeEliminar = datos?.puedeEliminar ?? false;

  const mapStock = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const s of stock) m.set(`${s.material_id}|${s.bodega_id}`, s.cantidad);
    return m;
  }, [stock]);

  // Stock total por material (suma de todas las bodegas)
  const mapStockTotal = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const s of stock) m.set(s.material_id, (m.get(s.material_id) ?? 0) + Number(s.cantidad));
    return m;
  }, [stock]);

  // proyectos permitidos por bodega (si la bodega tiene proyectos asignados)
  const proyectosPorBodega = React.useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const v of vinculos) {
      const set = m.get(v.bodega_id) ?? new Set<string>();
      set.add(v.proyecto_id);
      m.set(v.bodega_id, set);
    }
    return m;
  }, [vinculos]);

  function stockDisponible(materialId: string, bodegaId: string) {
    return mapStock.get(`${materialId}|${bodegaId}`) ?? 0;
  }

  // Proyectos a mostrar en el consumo: si la bodega tiene proyectos asignados,
  // se limita a esos (activos); si no, se muestran todos los activos.
  const proyectosParaConsumo = React.useMemo(() => {
    const permitidos = consumo.bodega_origen_id
      ? proyectosPorBodega.get(consumo.bodega_origen_id)
      : undefined;
    if (permitidos && permitidos.size > 0) {
      return proyectosActivos.filter((p) => permitidos.has(p.id));
    }
    return proyectosActivos;
  }, [consumo.bodega_origen_id, proyectosPorBodega, proyectosActivos]);

  const filtrados = materiales
    .filter((m) => {
      if (segmentoTab !== "Todos" && (m.segmento ?? "Construcción") !== segmentoTab) return false;
      if (estadoTab === "Activos" && !m.activo) return false;
      if (estadoTab === "Inactivos" && m.activo) return false;
      const q = busqueda.toLowerCase().trim();
      if (!q) return true;
      return (
        m.sku.toLowerCase().includes(q) ||
        m.descripcion.toLowerCase().includes(q) ||
        (m.categoria ?? "").toLowerCase().includes(q) ||
        (m.segmento ?? "").toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      if (orden === "sku") return a.sku.localeCompare(b.sku, "es");
      const cmp = a.descripcion.localeCompare(b.descripcion, "es", { sensitivity: "base" });
      return orden === "za" ? -cmp : cmp;
    });

  function abrirNuevo() {
    setEditando(null);
    const seg = segmentoTab !== "Todos" ? segmentoTab : "Construcción";
    setForm({ ...FORM_VACIO, segmento: seg, sku: siguienteSku(materiales, seg), bodega_inicial_id: bodegas[0]?.id ?? "" });
    setModalAbierto(true);
  }

  function abrirEdicion(m: Material) {
    setEditando(m);
    setForm({
      sku: m.sku,
      descripcion: m.descripcion,
      categoria: m.categoria ?? "",
      segmento: m.segmento ?? "Construcción",
      unidad_medida: m.unidad_medida,
      precio_unitario: String(m.precio_unitario),
      stock_minimo: String(m.stock_minimo),
      activo: m.activo,
      stock_inicial: "0",
      bodega_inicial_id: "",
    });
    setModalAbierto(true);
  }

  function abrirConsumo(m: Material) {
    setConsumiendo(m);
    setConsumo({ ...CONSUMO_VACIO, bodega_origen_id: bodegas[0]?.id ?? "" });
  }

  function abrirAjuste(m: Material) {
    setAjustando(m);
    setAjuste({ bodega_id: bodegas[0]?.id ?? "", nueva_cantidad: "" });
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!form.sku.trim() || !form.descripcion.trim()) {
      toast.error("SKU y descripción son obligatorios.");
      return;
    }
    setGuardando(true);
    try {
      const sb = getSupabaseClient();
      const payload = {
        sku: form.sku.trim(),
        descripcion: form.descripcion.trim(),
        categoria: form.categoria.trim() || null,
        segmento: form.segmento || "Construcción",
        unidad_medida: form.unidad_medida,
        precio_unitario: Number(form.precio_unitario) || 0,
        stock_minimo: Number(form.stock_minimo) || 0,
        activo: form.activo,
      };
      if (editando) {
        const { error } = await sb.from("materiales").update(payload).eq("id", editando.id);
        if (error) throw error;
        toast.exito("Material actualizado correctamente.");
      } else {
        const { data: nuevo, error } = await sb
          .from("materiales")
          .insert(payload)
          .select("id")
          .single();
        if (error) throw error;
        const stockIni = Number(form.stock_inicial) || 0;
        if (stockIni > 0 && form.bodega_inicial_id) {
          const { error: e2 } = await sb.from("movimientos_kardex").insert({
            tipo: "ENTRADA",
            material_id: (nuevo as { id: string }).id,
            cantidad: stockIni,
            costo_unitario: Number(form.precio_unitario) || 0,
            bodega_destino_id: form.bodega_inicial_id,
            concepto: "Stock inicial",
          });
          if (e2) throw e2;
        }
        toast.exito(
          stockIni > 0 && form.bodega_inicial_id
            ? `Material creado con ${stockIni} de stock inicial.`
            : "Material creado correctamente."
        );
      }
      setModalAbierto(false);
      refrescar();
    } catch (err) {
      toast.error(mensajeError(err));
    } finally {
      setGuardando(false);
    }
  }

  async function registrarConsumo(e: React.FormEvent) {
    e.preventDefault();
    if (!consumiendo) return;
    const cantidad = Number(consumo.cantidad);
    if (!consumo.bodega_origen_id) return toast.error("Selecciona la bodega de donde sale el material.");
    if (!cantidad || cantidad <= 0) return toast.error("La cantidad debe ser mayor a cero.");
    if (!consumo.proyecto_id) return toast.error("Selecciona el proyecto al que se imputa el consumo.");

    const disp = stockDisponible(consumiendo.id, consumo.bodega_origen_id);
    if (cantidad > disp) {
      return toast.error(`Stock insuficiente. Disponible: ${formatNumero(disp, 0)} ${consumiendo.unidad_medida}.`);
    }

    setRegistrandoConsumo(true);
    try {
      const sb = getSupabaseClient();
      const payload = {
        tipo: "SALIDA",
        material_id: consumiendo.id,
        cantidad,
        costo_unitario: consumiendo.precio_unitario || 0,
        bodega_origen_id: consumo.bodega_origen_id,
        bodega_destino_id: null,
        proyecto_id: consumo.proyecto_id,
        concepto: consumo.concepto.trim() || "Consumo de material en obra",
      };
      const { error } = await sb.from("movimientos_kardex").insert(payload);
      if (error) throw error;
      toast.exito("Consumo registrado. Se descontó el stock y se imputó al proyecto.");
      setConsumiendo(null);
      refrescar();
    } catch (err) {
      toast.error(mensajeError(err));
    } finally {
      setRegistrandoConsumo(false);
    }
  }

  async function registrarAjuste(e: React.FormEvent) {
    e.preventDefault();
    if (!ajustando) return;
    if (!ajuste.bodega_id) return toast.error("Selecciona la bodega a ajustar.");
    const nueva = Number(ajuste.nueva_cantidad);
    if (ajuste.nueva_cantidad.trim() === "" || Number.isNaN(nueva) || nueva < 0)
      return toast.error("Ingresa la cantidad correcta (0 o más).");
    const actual = stockDisponible(ajustando.id, ajuste.bodega_id);
    const diff = nueva - actual;
    if (diff === 0) return toast.error("La cantidad ingresada es igual al stock actual.");

    setGuardandoAjuste(true);
    try {
      const sb = getSupabaseClient();
      const payload = {
        tipo: "AJUSTE",
        material_id: ajustando.id,
        cantidad: Math.abs(diff),
        costo_unitario: ajustando.precio_unitario || 0,
        bodega_origen_id: diff < 0 ? ajuste.bodega_id : null,
        bodega_destino_id: diff > 0 ? ajuste.bodega_id : null,
        proyecto_id: null,
        concepto: `Ajuste manual de stock (${formatNumero(actual, 0)} → ${formatNumero(nueva, 0)})`,
      };
      const { error } = await sb.from("movimientos_kardex").insert(payload);
      if (error) throw error;
      toast.exito("Stock ajustado correctamente.");
      setAjustando(null);
      refrescar();
    } catch (err) {
      toast.error(mensajeError(err));
    } finally {
      setGuardandoAjuste(false);
    }
  }

  async function onScanArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) {
      setEscaneando(true);
      try {
        const d = await extraerDesdeArchivo<{ items?: Record<string, unknown>[] }>("material", f);
        const items = Array.isArray(d.items) ? d.items : [];
        if (items.length === 0) {
          toast.error("No se detectaron materiales en el documento.");
        } else {
          setFilasImport(items);
          setNombreArchivo(f.name);
          setImportarAbierto(true);
          toast.exito(`Se detectaron ${items.length} ítem(s). Revísalos y confirma la importación.`);
        }
      } catch (err) {
        toast.error(mensajeError(err));
      } finally {
        setEscaneando(false);
      }
    }
    e.target.value = "";
  }

  async function exportar() {
    try {
      await exportarExcel(
        "materiales_insiso",
        materiales.map((m) => ({
          sku: m.sku,
          descripcion: m.descripcion,
          categoria: m.categoria ?? "",
          segmento: m.segmento ?? "Construcción",
          unidad_medida: m.unidad_medida,
          stock: mapStockTotal.get(m.id) ?? 0,
          precio_unitario: m.precio_unitario,
          stock_minimo: m.stock_minimo,
          activo: m.activo ? "Sí" : "No",
        })),
        "Materiales"
      );
      toast.exito(`Exportados ${materiales.length} material(es) a Excel.`);
    } catch (err) {
      toast.error(mensajeError(err));
    }
  }

  async function plantillaMateriales() {
    try {
      await descargarPlantilla(
        "plantilla_materiales",
        [
          {
            sku: "MAT-0001",
            descripcion: "Cemento Portland 25kg",
            categoria: "Cementos",
            segmento: "Construcción",
            unidad_medida: "sc",
            precio_unitario: 5200,
            stock_minimo: 10,
            cantidad: 0,
          },
        ],
        "Materiales"
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
    const nrm = (x: string) => x.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const canon = (v: string) =>
      (SEGMENTOS_MATERIAL as readonly string[]).find((sg) => nrm(sg) === nrm(v)) ?? "";

    // Materiales que ya existen, por SKU → para no duplicar y poder sumar stock
    const existentes = new Map<string, { id: string; precio: number }>();
    for (const m of materiales)
      existentes.set(m.sku.trim().toLowerCase(), { id: m.id, precio: m.precio_unitario });

    const nuevos: Record<string, unknown>[] = [];
    const cantPorSku = new Map<string, number>();
    const skuInfo = new Map<string, { id: string; precio: number }>();
    let saltadas = 0;
    let yaExistian = 0;
    for (const fila of filasImport) {
      const sku = valorCampo(fila, "sku", "codigo", "código");
      const descripcion = valorCampo(fila, "descripcion", "descripción", "detalle", "nombre");
      if (!sku || !descripcion) {
        saltadas++;
        continue;
      }
      const key = sku.trim().toLowerCase();
      const seg = canon(valorCampo(fila, "segmento", "segmento material", "tipo")) || segmentoImport;
      const cant = Number(valorCampo(fila, "cantidad", "stock inicial", "stock_inicial")) || 0;
      if (cant > 0) cantPorSku.set(key, (cantPorSku.get(key) || 0) + cant);
      const ex = existentes.get(key);
      if (ex) {
        yaExistian++;
        skuInfo.set(key, ex);
      } else {
        nuevos.push({
          sku,
          descripcion,
          categoria: valorCampo(fila, "categoria", "categoría") || null,
          segmento: seg,
          unidad_medida: valorCampo(fila, "unidad_medida", "unidad", "um") || "un",
          precio_unitario: Number(valorCampo(fila, "precio_unitario", "precio")) || 0,
          stock_minimo: Number(valorCampo(fila, "stock_minimo", "stock minimo", "stock")) || 0,
          activo: true,
        });
      }
    }
    if (nuevos.length === 0 && yaExistian === 0) {
      toast.error("No hay filas válidas. Revisa que existan las columnas 'sku' y 'descripcion'.");
      return;
    }
    setImportando(true);
    try {
      const sb = getSupabaseClient();
      if (nuevos.length) {
        const { data, error } = await sb
          .from("materiales")
          .insert(nuevos)
          .select("id, sku, precio_unitario");
        if (error) throw error;
        for (const m of (data ?? []) as { id: string; sku: string; precio_unitario: number }[]) {
          skuInfo.set(m.sku.trim().toLowerCase(), { id: m.id, precio: m.precio_unitario });
        }
      }

      // Sumar stock a la bodega elegida (crea ENTRADA; se suma al stock ya existente)
      let conStock = 0;
      if (bodegaImport) {
        const movs = [];
        for (const [key, cant] of Array.from(cantPorSku)) {
          const info = skuInfo.get(key);
          if (cant > 0 && info) {
            movs.push({
              tipo: "ENTRADA",
              material_id: info.id,
              cantidad: cant,
              costo_unitario: info.precio || 0,
              bodega_origen_id: null,
              bodega_destino_id: bodegaImport,
              proyecto_id: null,
              concepto: "Carga/actualización por importación",
            });
          }
        }
        if (movs.length) {
          const r = await sb.from("movimientos_kardex").insert(movs);
          if (r.error) throw r.error;
          conStock = movs.length;
        }
      }

      toast.exito(
        `${nuevos.length} nuevo(s), ${yaExistian} ya existía(n).` +
          (conStock ? ` Stock sumado en ${conStock} material(es).` : "") +
          (saltadas ? ` ${saltadas} omitida(s).` : "")
      );
      setImportarAbierto(false);
      setFilasImport(null);
      setNombreArchivo("");
      refrescar();
    } catch (err) {
      toast.error(mensajeError(err));
    } finally {
      setImportando(false);
    }
  }

  async function desactivarSeleccionados() {
    const ids = Array.from(msel.sel);
    if (ids.length === 0) return;
    setEliminandoBulk(true);
    const sb = getSupabaseClient();
    const { error } = await sb.from("materiales").update({ activo: false }).in("id", ids);
    if (error) toast.error(mensajeError(error));
    else toast.exito(`${ids.length} material(es) desactivado(s) (ocultos, con historial intacto).`);
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
      // Borrado forzado: primero sus movimientos y stock (si no, el kardex lo bloquea)
      await sb.from("movimientos_kardex").delete().eq("material_id", id);
      await sb.from("inventario_stock").delete().eq("material_id", id);
      const { error } = await sb.from("materiales").delete().eq("id", id);
      if (error) fail++;
      else ok++;
    }
    toast.exito(`${ok} eliminado(s) (con sus movimientos).` + (fail ? ` ${fail} no se pudo(n).` : ""));
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
      await sb.from("movimientos_kardex").delete().eq("material_id", aEliminar.id);
      await sb.from("inventario_stock").delete().eq("material_id", aEliminar.id);
      const { error } = await sb.from("materiales").delete().eq("id", aEliminar.id);
      if (error) throw error;
      toast.exito("Material eliminado (con sus movimientos).");
      setAEliminar(null);
      refrescar();
    } catch (err) {
      const e = err as { code?: string };
      if (e?.code === "23503")
        toast.error(
          "No se puede eliminar: el material tiene movimientos de inventario. Desactívalo (Seleccionar → Desactivar, o edítalo y desmarca 'Material activo')."
        );
      else toast.error(mensajeError(err));
    } finally {
      setEliminando(false);
    }
  }

  const dispConsumo = consumiendo && consumo.bodega_origen_id
    ? stockDisponible(consumiendo.id, consumo.bodega_origen_id)
    : null;

  const stockActualAjuste =
    ajustando && ajuste.bodega_id ? stockDisponible(ajustando.id, ajuste.bodega_id) : null;

  return (
    <div>
      <PageHeader
        titulo="Catálogo de Materiales"
        descripcion="Datos maestros de materiales. Usa “Consumir” para descontar material e imputarlo a un proyecto."
        icono={Package}
        acciones={
          <div className="flex flex-wrap gap-2">
            {ESCANEO_ACTIVO && (
              <Button variante="outline" onClick={() => scanInputRef.current?.click()} cargando={escaneando}>
                {!escaneando && <ScanLine className="h-4 w-4" />} Escanear
              </Button>
            )}
            <Button
              variante="outline"
              onClick={() => {
                setSegmentoImport(segmentoTab !== "Todos" ? segmentoTab : "Construcción");
                setBodegaImport("");
                setImportarAbierto(true);
              }}
            >
              <Upload className="h-4 w-4" /> Importar
            </Button>
            <Button variante="outline" onClick={exportar} disabled={materiales.length === 0}>
              <Download className="h-4 w-4" /> Exportar
            </Button>
            <BotonSeleccionar modo={msel.modo} onClick={() => (msel.modo ? msel.salir() : msel.setModo(true))} />
            <Button onClick={abrirNuevo}>
              <Plus className="h-4 w-4" /> Nuevo Material
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

      <div className="mb-4 flex flex-wrap gap-2">
        {(["Todos", ...SEGMENTOS_MATERIAL] as string[]).map((seg) => (
          <Button
            key={seg}
            variante={segmentoTab === seg ? "primary" : "outline"}
            tamano="sm"
            onClick={() => setSegmentoTab(seg)}
          >
            {seg}
          </Button>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1 max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por SKU, descripción o categoría…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select
          value={orden}
          onChange={(e) => setOrden(e.target.value as "az" | "za" | "sku")}
          className="h-10 w-auto"
        >
          <option value="az">Orden: A → Z</option>
          <option value="za">Orden: Z → A</option>
          <option value="sku">Orden: SKU</option>
        </Select>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {(["Todos", "Activos", "Inactivos"] as const).map((est) => {
          const activo = estadoTab === est;
          const color =
            est === "Activos"
              ? activo
                ? "bg-emerald-600 text-white ring-emerald-600"
                : "text-emerald-700 ring-emerald-300 hover:bg-emerald-50"
              : est === "Inactivos"
                ? activo
                  ? "bg-slate-600 text-white ring-slate-600"
                  : "text-slate-600 ring-slate-300 hover:bg-slate-100"
                : activo
                  ? "bg-primary text-white ring-primary"
                  : "text-foreground ring-border hover:bg-muted";
          return (
            <button
              key={est}
              type="button"
              onClick={() => setEstadoTab(est)}
              className={"rounded-full px-3 py-1 text-sm font-medium ring-1 transition-colors " + color}
            >
              {est}
            </button>
          );
        })}
      </div>

      {msel.modo && (
        <BarraSeleccion
          total={filtrados.length}
          cantidad={msel.sel.size}
          todosMarcados={filtrados.length > 0 && filtrados.every((m) => msel.sel.has(m.id))}
          onTodos={() => msel.seleccionarTodos(filtrados.map((m) => m.id))}
          onEliminar={puedeEliminar ? () => setBulkConfirm(true) : undefined}
          onDesactivar={desactivarSeleccionados}
        />
      )}

      {cargando ? (
        <LoadingState mensaje="Cargando materiales…" />
      ) : error ? (
        <ErrorState mensaje={error} onReintentar={refrescar} />
      ) : filtrados.length === 0 ? (
        <EmptyState
          titulo={busqueda ? "Sin resultados" : "Aún no hay materiales"}
          descripcion={
            busqueda
              ? "Prueba con otro término de búsqueda."
              : "Crea tu primer material para comenzar a gestionar el inventario."
          }
          accion={
            !busqueda && (
              <Button onClick={abrirNuevo}>
                <Plus className="h-4 w-4" /> Nuevo Material
              </Button>
            )
          }
        />
      ) : (
        <TableContainer>
          <THead>
            <TR>
              {msel.modo && <TH className="w-8"></TH>}
              <TH>SKU</TH>
              <TH>Descripción</TH>
              <TH>Categoría</TH>
              <TH>Segmento</TH>
              <TH className="text-center">Unidad</TH>
              <TH className="text-right">Stock</TH>
              <TH className="text-right">Precio Unit.</TH>
              <TH className="text-right">Stock Mín.</TH>
              <TH className="text-center">Estado</TH>
              <TH className="text-right">Acciones</TH>
            </TR>
          </THead>
          <TBody>
            {filtrados.map((m) => (
              <TR key={m.id}>
                {msel.modo && (
                  <TD>
                    <CasillaFila marcado={msel.sel.has(m.id)} onChange={() => msel.toggle(m.id)} />
                  </TD>
                )}
                <TD className="font-mono text-xs font-semibold text-primary">{m.sku}</TD>
                <TD className="font-medium">{m.descripcion}</TD>
                <TD className="text-muted-foreground">{m.categoria ?? "—"}</TD>
                <TD>
                  <Badge color={COLOR_SEGMENTO[m.segmento ?? "Construcción"] ?? COLOR_SEGMENTO.Otros}>
                    {m.segmento ?? "Construcción"}
                  </Badge>
                </TD>
                <TD className="text-center">{m.unidad_medida}</TD>
                <TD className="text-right">
                  {(() => {
                    const total = mapStockTotal.get(m.id) ?? 0;
                    const critico = m.stock_minimo > 0 && total < m.stock_minimo;
                    return (
                      <span className={critico ? "font-semibold text-rose-600" : "font-medium"}>
                        {formatNumero(total, 0)}
                      </span>
                    );
                  })()}
                </TD>
                <TD className="text-right">{formatCLP(m.precio_unitario)}</TD>
                <TD className="text-right">{formatNumero(m.stock_minimo, 0)}</TD>
                <TD className="text-center">
                  {m.activo ? (
                    <Badge color="bg-emerald-100 text-emerald-700 ring-emerald-200">Activo</Badge>
                  ) : (
                    <Badge color="bg-slate-100 text-slate-600 ring-slate-200">Inactivo</Badge>
                  )}
                </TD>
                <TD>
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      variante="ghost"
                      tamano="sm"
                      onClick={() => abrirConsumo(m)}
                      className="text-amber-600 hover:bg-amber-50"
                    >
                      <MinusCircle className="h-4 w-4" /> Consumir
                    </Button>
                    <Button
                      variante="ghost"
                      tamano="sm"
                      onClick={() => abrirAjuste(m)}
                      className="text-sky-600 hover:bg-sky-50"
                    >
                      Ajustar
                    </Button>
                    <Button variante="ghost" tamano="icon" onClick={() => abrirEdicion(m)} aria-label="Editar">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    {puedeEliminar && (
                      <Button
                        variante="ghost"
                        tamano="icon"
                        onClick={() => setAEliminar(m)}
                        aria-label="Eliminar"
                        className="text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </TD>
              </TR>
            ))}
          </TBody>
        </TableContainer>
      )}

      {!cargando && !error && filtrados.length > 0 && (
        <p className="mt-3 text-xs text-muted-foreground">
          {filtrados.length} material(es) {busqueda && `de ${materiales.length} totales`}
        </p>
      )}

      {/* Modal Crear / Editar */}
      <Modal
        abierto={modalAbierto}
        onCerrar={() => setModalAbierto(false)}
        titulo={editando ? "Editar Material" : "Nuevo Material"}
        descripcion="Completa los datos del material en el catálogo maestro."
      >
        <form onSubmit={guardar} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="SKU" required hint="Se genera automático por segmento; puedes editarlo">
              <Input
                value={form.sku}
                onChange={(e) => setForm({ ...form, sku: e.target.value })}
                placeholder="MAT-0001"
              />
            </Field>
            <Field label="Categoría">
              <Input
                value={form.categoria}
                onChange={(e) => setForm({ ...form, categoria: e.target.value })}
                placeholder="Cementos, Acero…"
              />
            </Field>
          </div>
          <Field label="Descripción" required>
            <Textarea
              value={form.descripcion}
              onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
              placeholder="Cemento Portland 25kg"
            />
          </Field>
          <Field label="Segmento" required hint="Aseo, Oficina o Construcción">
            <Select value={form.segmento} onChange={(e) => { const seg = e.target.value; setForm((prev) => ({ ...prev, segmento: seg, sku: editando ? prev.sku : siguienteSku(materiales, seg) })); }}>
              {SEGMENTOS_MATERIAL.map((seg) => (
                <option key={seg} value={seg}>
                  {seg}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Unidad de medida" required>
              <Select
                value={form.unidad_medida}
                onChange={(e) => setForm({ ...form, unidad_medida: e.target.value })}
              >
                {UNIDADES_MEDIDA.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Precio unitario (CLP)">
              <Input
                type="number"
                min="0"
                step="1"
                value={form.precio_unitario}
                onChange={(e) => setForm({ ...form, precio_unitario: e.target.value })}
              />
            </Field>
            <Field label="Stock mínimo">
              <Input
                type="number"
                min="0"
                step="1"
                value={form.stock_minimo}
                onChange={(e) => setForm({ ...form, stock_minimo: e.target.value })}
              />
            </Field>
          </div>
          {!editando && (
            <div className="grid grid-cols-1 gap-4 rounded-lg bg-emerald-50 p-3 ring-1 ring-emerald-200 sm:grid-cols-2">
              <Field label="Stock inicial" hint="Cantidad con la que ingresa (opcional)">
                <Input
                  type="number"
                  min="0"
                  step="any"
                  value={form.stock_inicial}
                  onChange={(e) => setForm({ ...form, stock_inicial: e.target.value })}
                  placeholder="0"
                />
              </Field>
              <Field label="Bodega de ingreso">
                <Select
                  value={form.bodega_inicial_id}
                  onChange={(e) => setForm({ ...form, bodega_inicial_id: e.target.value })}
                >
                  <option value="">— Selecciona bodega —</option>
                  {bodegas.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.codigo} · {b.nombre}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          )}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.activo}
              onChange={(e) => setForm({ ...form, activo: e.target.checked })}
              className="h-4 w-4 rounded border-input"
            />
            Material activo
          </label>

          <ModalFooter>
            <Button type="button" variante="outline" onClick={() => setModalAbierto(false)}>
              Cancelar
            </Button>
            <Button type="submit" cargando={guardando}>
              {editando ? "Guardar cambios" : "Crear material"}
            </Button>
          </ModalFooter>
        </form>
      </Modal>

      {/* Modal Ajustar stock (corrige la cantidad en una bodega) */}
      <Modal
        abierto={!!ajustando}
        onCerrar={() => setAjustando(null)}
        titulo="Ajustar stock"
        descripcion="Corrige la cantidad de un material en una bodega. Queda registrado como ajuste en el kardex."
        ancho="max-w-lg"
      >
        <form onSubmit={registrarAjuste} className="space-y-4">
          <div className="rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm">
            <span className="font-mono text-xs text-primary">{ajustando?.sku}</span>{" "}
            <span className="font-medium">{ajustando?.descripcion}</span>
            <span className="text-muted-foreground"> · {ajustando?.unidad_medida}</span>
          </div>

          <Field
            label="Bodega"
            required
            hint={
              stockActualAjuste != null
                ? `Stock actual: ${formatNumero(stockActualAjuste, 0)} ${ajustando?.unidad_medida}`
                : undefined
            }
          >
            <Select
              value={ajuste.bodega_id}
              onChange={(e) => setAjuste((a) => ({ ...a, bodega_id: e.target.value }))}
            >
              <option value="">— Selecciona —</option>
              {bodegas.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.codigo} · {b.nombre}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Cantidad correcta" required hint="La cantidad real que debe quedar en esa bodega">
            <Input
              type="number"
              min="0"
              step="any"
              value={ajuste.nueva_cantidad}
              onChange={(e) => setAjuste((a) => ({ ...a, nueva_cantidad: e.target.value }))}
              placeholder="0"
            />
          </Field>

          <ModalFooter>
            <Button type="button" variante="outline" onClick={() => setAjustando(null)}>
              Cancelar
            </Button>
            <Button type="submit" cargando={guardandoAjuste}>
              Guardar ajuste
            </Button>
          </ModalFooter>
        </form>
      </Modal>

      {/* Modal Consumir material (SALIDA imputada a proyecto) */}
      <Modal
        abierto={!!consumiendo}
        onCerrar={() => setConsumiendo(null)}
        titulo="Consumir material"
        descripcion="Descuenta material de una bodega y lo imputa como gasto a un proyecto activo."
        ancho="max-w-lg"
      >
        <form onSubmit={registrarConsumo} className="space-y-4">
          <div className="rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm">
            <span className="font-mono text-xs text-primary">{consumiendo?.sku}</span>{" "}
            <span className="font-medium">{consumiendo?.descripcion}</span>
            <span className="text-muted-foreground"> · {consumiendo?.unidad_medida}</span>
          </div>

          <Field
            label="Bodega de origen"
            required
            hint={dispConsumo != null ? `Disponible: ${formatNumero(dispConsumo, 0)} ${consumiendo?.unidad_medida}` : undefined}
          >
            <Select
              value={consumo.bodega_origen_id}
              onChange={(e) =>
                setConsumo((c) => ({ ...c, bodega_origen_id: e.target.value, proyecto_id: "" }))
              }
            >
              <option value="">— Selecciona —</option>
              {bodegas.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.codigo} · {b.nombre}
                </option>
              ))}
            </Select>
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Cantidad usada" required>
              <Input
                type="number"
                min="0"
                step="any"
                value={consumo.cantidad}
                onChange={(e) => setConsumo((c) => ({ ...c, cantidad: e.target.value }))}
                placeholder="0"
              />
            </Field>
            <Field label="Proyecto (activo)" required>
              <Select
                value={consumo.proyecto_id}
                onChange={(e) => setConsumo((c) => ({ ...c, proyecto_id: e.target.value }))}
              >
                <option value="">— Selecciona —</option>
                {proyectosParaConsumo.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.codigo} · {p.nombre}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          {proyectosActivos.length === 0 && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
              No hay proyectos en estado “Activo”. Activa un proyecto para poder imputar consumos.
            </p>
          )}

          <Field label="Observación">
            <Textarea
              value={consumo.concepto}
              onChange={(e) => setConsumo((c) => ({ ...c, concepto: e.target.value }))}
              placeholder="Consumo en fundaciones, radier, etc."
            />
          </Field>

          {consumiendo && Number(consumo.cantidad) > 0 && (
            <p className="rounded-lg border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              Valor imputado al proyecto:{" "}
              <span className="font-semibold text-foreground">
                {formatCLP(Number(consumo.cantidad) * (consumiendo.precio_unitario || 0))}
              </span>
            </p>
          )}

          <ModalFooter>
            <Button type="button" variante="outline" onClick={() => setConsumiendo(null)}>
              Cancelar
            </Button>
            <Button type="submit" cargando={registrandoConsumo}>
              Registrar consumo
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
        titulo="Importar materiales desde Excel"
        descripcion="Carga masiva. Descarga la plantilla para no equivocarte en las columnas."
        ancho="max-w-lg"
      >
        <div className="space-y-4">
          <div className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            Columnas: <b>sku</b>, <b>descripcion</b>, categoria, segmento, unidad_medida, precio_unitario,
            stock_minimo, <b>cantidad</b> (opcional, para dejar stock inicial). Obligatorias: <b>sku</b> y{" "}
            <b>descripcion</b>. Si el Excel no trae <b>segmento</b>, se usa el elegido abajo. Si un <b>SKU ya existe</b>, no se duplica: con <b>cantidad + bodega</b> se SUMA a su stock.
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Segmento (para todas las filas)">
              <Select value={segmentoImport} onChange={(e) => setSegmentoImport(e.target.value)}>
                {SEGMENTOS_MATERIAL.map((seg) => (
                  <option key={seg} value={seg}>
                    {seg}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Bodega para stock inicial (opcional)" hint="Requiere columna 'cantidad' en el Excel.">
              <Select value={bodegaImport} onChange={(e) => setBodegaImport(e.target.value)}>
                <option value="">— Sin stock inicial —</option>
                {bodegas.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.codigo} · {b.nombre}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Button type="button" variante="outline" tamano="sm" onClick={plantillaMateriales}>
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
        titulo="Eliminar material"
        mensaje={`¿Eliminar "${aEliminar?.descripcion}"? Se borrarán también sus movimientos de inventario y stock. No se puede deshacer.`}
        cargando={eliminando}
        onConfirmar={eliminar}
        onCancelar={() => setAEliminar(null)}
      />

      <ConfirmDialog
        abierto={bulkConfirm}
        titulo="Eliminar seleccionados"
        mensaje={`¿Eliminar ${msel.sel.size} material(es)? Se borrarán TAMBIÉN sus movimientos de inventario y stock. Ideal para limpiar datos de prueba. No se puede deshacer.`}
        cargando={eliminandoBulk}
        onConfirmar={eliminarSeleccionados}
        onCancelar={() => setBulkConfirm(false)}
      />
    </div>
  );
}
