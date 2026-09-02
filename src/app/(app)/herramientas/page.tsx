"use client";

import * as React from "react";
import {
  Wrench,
  Plus,
  Pencil,
  Trash2,
  LogOut,
  LogIn,
  User,
  Hammer,
  Shuffle,
  Boxes,
  SlidersHorizontal,
  Search,
  Upload,
  Download,
} from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useConsulta } from "@/lib/hooks";
import { mensajeError, formatCLP, formatFechaHora, formatNumero, cn } from "@/lib/utils";
import type {
  Herramienta,
  HerramientaStock,
  PrestamoHerramienta,
  Proyecto,
  Bodega,
  EstadoHerramienta,
} from "@/lib/types";
import {
  ESTADOS_HERRAMIENTA,
  ETIQUETA_ESTADO_HERRAMIENTA,
  COLOR_ESTADO_HERRAMIENTA,
} from "@/lib/constants";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Field, Select, Textarea } from "@/components/ui/field";
import { Combobox } from "@/components/ui/combobox";
import { Modal, ModalFooter } from "@/components/ui/modal";
import { ConfirmDialog } from "@/components/ui/confirm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingState, ErrorState, EmptyState } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { exportarExcel, descargarPlantilla, leerExcel, valorCampo, esVerdadero } from "@/lib/excel";
import { useMultiSeleccion, BotonSeleccionar, BarraSeleccion, CasillaFila } from "@/components/ui/multiseleccion";

const FORM_VACIO = {
  codigo: "",
  nombre: "",
  descripcion: "",
  categoria: "",
  valor: "0",
  bodega_id: "",
  estado: "DISPONIBLE" as EstadoHerramienta,
  arrendada: false,
  valor_arriendo: "0",
  periodo_arriendo: "Mes",
  por_cantidad: false,
  cantidad: "1",
};

type BodegaMini = Pick<Bodega, "id" | "codigo" | "nombre">;

export default function HerramientasPage() {
  const toast = useToast();
  const [modalAbierto, setModalAbierto] = React.useState(false);
  const [editando, setEditando] = React.useState<Herramienta | null>(null);
  const [form, setForm] = React.useState(FORM_VACIO);
  const [guardando, setGuardando] = React.useState(false);

  const [prestar, setPrestar] = React.useState<Herramienta | null>(null);
  const [formPrestamo, setFormPrestamo] = React.useState({
    responsable_nombre: "",
    proyecto_id: "",
    observaciones: "",
  });

  const [devolver, setDevolver] = React.useState<Herramienta | null>(null);
  const [aEliminar, setAEliminar] = React.useState<Herramienta | null>(null);

  const [traspasar, setTraspasar] = React.useState<Herramienta | null>(null);
  const [formTraspaso, setFormTraspaso] = React.useState({
    bodega_origen_id: "",
    bodega_destino_id: "",
    cantidad: "1",
    motivo: "",
  });

  const [ajustar, setAjustar] = React.useState<Herramienta | null>(null);
  const [formAjuste, setFormAjuste] = React.useState({ bodega_id: "", delta: "", motivo: "" });

  const [procesando, setProcesando] = React.useState(false);
  const [busqueda, setBusqueda] = React.useState("");
  const [orden, setOrden] = React.useState<"az" | "za">("az");
  const msel = useMultiSeleccion();
  const [bulkConfirm, setBulkConfirm] = React.useState(false);
  const [eliminandoBulk, setEliminandoBulk] = React.useState(false);

  // Importar / Exportar Excel
  const [importarAbierto, setImportarAbierto] = React.useState(false);
  const [filasImport, setFilasImport] = React.useState<Record<string, unknown>[] | null>(null);
  const [nombreArchivo, setNombreArchivo] = React.useState("");
  const [importando, setImportando] = React.useState(false);

  const { datos, cargando, error, refrescar } = useConsulta(async () => {
    const sb = getSupabaseClient();
    const [herramientas, prestamos, proyectos, bodegas, stock] = await Promise.all([
      sb.from("herramientas").select("*").order("codigo"),
      sb.from("prestamos_herramientas").select("*").eq("estado", "PRESTADA"),
      sb.from("proyectos").select("id, codigo, nombre").order("codigo"),
      sb.from("bodegas").select("id, codigo, nombre").eq("activo", true).order("codigo"),
      sb.from("herramienta_stock").select("herramienta_id, bodega_id, cantidad"),
    ]);
    if (herramientas.error) throw herramientas.error;
    if (prestamos.error) throw prestamos.error;
    if (proyectos.error) throw proyectos.error;
    if (bodegas.error) throw bodegas.error;
    if (stock.error) throw stock.error;
    return {
      herramientas: herramientas.data as Herramienta[],
      prestamos: prestamos.data as PrestamoHerramienta[],
      proyectos: proyectos.data as Pick<Proyecto, "id" | "codigo" | "nombre">[],
      bodegas: bodegas.data as BodegaMini[],
      stock: (stock.data ?? []) as HerramientaStock[],
    };
  });

  const herramientas = datos?.herramientas ?? [];
  const prestamos = datos?.prestamos ?? [];
  const proyectos = datos?.proyectos ?? [];
  const bodegas = datos?.bodegas ?? [];

  // Bodeguero de bodega única: si sólo hay una bodega visible, se preselecciona.
  React.useEffect(() => {
    if (bodegas.length === 1) {
      const b = bodegas[0].id;
      setForm((f) => (f.bodega_id ? f : { ...f, bodega_id: b }));
    }
  }, [bodegas]);
  const stock = datos?.stock ?? [];
  const filtradas = (datos?.herramientas ?? [])
    .filter((h) => {
      const q = busqueda.toLowerCase().trim();
      if (!q) return true;
      return (
        h.codigo.toLowerCase().includes(q) ||
        h.nombre.toLowerCase().includes(q) ||
        (h.categoria ?? "").toLowerCase().includes(q) ||
        (h.descripcion ?? "").toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      const cmp = a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" });
      return orden === "za" ? -cmp : cmp;
    });

  const mapProyecto = React.useMemo(() => new Map(proyectos.map((p) => [p.id, p])), [proyectos]);
  const mapBodega = React.useMemo(() => new Map(bodegas.map((b) => [b.id, b])), [bodegas]);

  const prestamoActivo = React.useMemo(() => {
    const m = new Map<string, PrestamoHerramienta>();
    for (const p of prestamos) m.set(p.herramienta_id, p);
    return m;
  }, [prestamos]);

  // Stock por herramienta y por (herramienta|bodega)
  const stockPorHerramienta = React.useMemo(() => {
    const m = new Map<string, { bodega_id: string; cantidad: number }[]>();
    for (const s of stock) {
      const arr = m.get(s.herramienta_id) ?? [];
      arr.push({ bodega_id: s.bodega_id, cantidad: s.cantidad });
      m.set(s.herramienta_id, arr);
    }
    return m;
  }, [stock]);

  const stockMap = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const s of stock) m.set(`${s.herramienta_id}|${s.bodega_id}`, s.cantidad);
    return m;
  }, [stock]);

  function stockEn(herramientaId: string, bodegaId: string) {
    return stockMap.get(`${herramientaId}|${bodegaId}`) ?? 0;
  }
  function totalUnidades(h: Herramienta) {
    if (!h.por_cantidad) return 1;
    const items = stockPorHerramienta.get(h.id) ?? [];
    return items.reduce((acc, i) => acc + i.cantidad, 0);
  }
  function desglose(h: Herramienta) {
    return (stockPorHerramienta.get(h.id) ?? [])
      .filter((i) => i.cantidad !== 0)
      .map((i) => ({ codigo: mapBodega.get(i.bodega_id)?.codigo ?? "—", cantidad: i.cantidad }));
  }

  const unidadesTotales = herramientas.reduce((acc, h) => acc + totalUnidades(h), 0);
  const resumen = {
    fichas: herramientas.length,
    unidades: unidadesTotales,
    disponibles: herramientas.filter((h) => !h.por_cantidad && h.estado === "DISPONIBLE").length,
    prestadas: herramientas.filter((h) => h.estado === "PRESTADA").length,
  };

  function abrirNuevo() {
    setEditando(null);
    setForm(FORM_VACIO);
    setModalAbierto(true);
  }

  function abrirEdicion(h: Herramienta) {
    setEditando(h);
    setForm({
      codigo: h.codigo,
      nombre: h.nombre,
      descripcion: h.descripcion ?? "",
      categoria: h.categoria ?? "",
      valor: String(h.valor),
      bodega_id: h.bodega_id ?? "",
      estado: h.estado,
      arrendada: h.arrendada,
      valor_arriendo: String(h.valor_arriendo ?? 0),
      periodo_arriendo: h.periodo_arriendo ?? "Mes",
      por_cantidad: h.por_cantidad,
      cantidad: String(h.cantidad ?? 1),
    });
    setModalAbierto(true);
  }

  function abrirTraspaso(h: Herramienta) {
    setTraspasar(h);
    if (h.por_cantidad) {
      const items = stockPorHerramienta.get(h.id) ?? [];
      const origen = items.find((i) => i.cantidad > 0)?.bodega_id ?? "";
      setFormTraspaso({ bodega_origen_id: origen, bodega_destino_id: "", cantidad: "", motivo: "" });
    } else {
      setFormTraspaso({
        bodega_origen_id: h.bodega_id ?? "",
        bodega_destino_id: "",
        cantidad: "1",
        motivo: "",
      });
    }
  }

  function abrirAjuste(h: Herramienta) {
    setAjustar(h);
    const primera = (stockPorHerramienta.get(h.id) ?? [])[0]?.bodega_id ?? "";
    setFormAjuste({ bodega_id: primera, delta: "", motivo: "" });
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!form.codigo.trim() || !form.nombre.trim()) {
      toast.error("Código y nombre son obligatorios.");
      return;
    }
    const cantInicial = Math.max(1, Math.floor(Number(form.cantidad) || 1));
    if (!editando && form.por_cantidad) {
      if (!form.bodega_id) return toast.error("Selecciona la bodega inicial de las unidades.");
    }

    setGuardando(true);
    try {
      const sb = getSupabaseClient();

      // Campos comunes
      const base = {
        codigo: form.codigo.trim(),
        nombre: form.nombre.trim(),
        descripcion: form.descripcion.trim() || null,
        categoria: form.categoria.trim() || null,
        valor: Number(form.valor) || 0,
        arrendada: form.arrendada,
        valor_arriendo: form.arrendada ? Number(form.valor_arriendo) || 0 : 0,
        periodo_arriendo: form.arrendada ? form.periodo_arriendo : null,
      };

      if (editando) {
        // En edición NO cambiamos por_cantidad ni el stock (se maneja con Ajustar/Traspasar)
        const payload: Record<string, unknown> = { ...base };
        if (!editando.por_cantidad) {
          payload.bodega_id = form.bodega_id || null;
          payload.estado = form.estado === "PRESTADA" ? "DISPONIBLE" : form.estado;
        }
        const { error } = await sb.from("herramientas").update(payload).eq("id", editando.id);
        if (error) throw error;
        toast.exito("Herramienta actualizada.");
      } else if (form.por_cantidad) {
        // Nueva herramienta POR CANTIDAD
        const { data, error } = await sb
          .from("herramientas")
          .insert({
            ...base,
            por_cantidad: true,
            cantidad: cantInicial,
            bodega_id: form.bodega_id || null,
            estado: "DISPONIBLE",
          })
          .select("id")
          .single();
        if (error) throw error;
        const hId = (data as { id: string }).id;
        const st = await sb
          .from("herramienta_stock")
          .insert({ herramienta_id: hId, bodega_id: form.bodega_id, cantidad: cantInicial });
        if (st.error) throw st.error;
        toast.exito(`Herramienta creada con ${cantInicial} unidad(es).`);
      } else {
        // Nueva herramienta ÚNICA (comportamiento clásico)
        const { error } = await sb.from("herramientas").insert({
          ...base,
          por_cantidad: false,
          cantidad: 1,
          bodega_id: form.bodega_id || null,
          estado: form.estado === "PRESTADA" ? "DISPONIBLE" : form.estado,
        });
        if (error) throw error;
        toast.exito("Herramienta creada.");
      }

      setModalAbierto(false);
      refrescar();
    } catch (err) {
      toast.error(mensajeError(err));
    } finally {
      setGuardando(false);
    }
  }

  async function registrarPrestamo(e: React.FormEvent) {
    e.preventDefault();
    if (!prestar) return;
    if (!formPrestamo.responsable_nombre.trim()) {
      toast.error("Indica el responsable que recibe la herramienta.");
      return;
    }
    setProcesando(true);
    try {
      const sb = getSupabaseClient();
      const { error } = await sb.from("prestamos_herramientas").insert({
        herramienta_id: prestar.id,
        responsable_nombre: formPrestamo.responsable_nombre.trim(),
        proyecto_id: formPrestamo.proyecto_id || null,
        observaciones: formPrestamo.observaciones.trim() || null,
      });
      if (error) throw error;
      toast.exito("Herramienta entregada (checkout registrado).");
      setPrestar(null);
      setFormPrestamo({ responsable_nombre: "", proyecto_id: "", observaciones: "" });
      refrescar();
    } catch (err) {
      toast.error(mensajeError(err));
    } finally {
      setProcesando(false);
    }
  }

  async function registrarDevolucion() {
    if (!devolver) return;
    setProcesando(true);
    try {
      const sb = getSupabaseClient();
      const { error } = await sb
        .from("prestamos_herramientas")
        .update({ estado: "DEVUELTA", fecha_devolucion: new Date().toISOString() })
        .eq("herramienta_id", devolver.id)
        .eq("estado", "PRESTADA");
      if (error) throw error;
      toast.exito("Devolución registrada (check-in). Herramienta disponible.");
      setDevolver(null);
      refrescar();
    } catch (err) {
      toast.error(mensajeError(err));
    } finally {
      setProcesando(false);
    }
  }

  async function fijarStock(hId: string, bId: string, nuevaCantidad: number) {
    const sb = getSupabaseClient();
    return sb
      .from("herramienta_stock")
      .upsert(
        { herramienta_id: hId, bodega_id: bId, cantidad: nuevaCantidad },
        { onConflict: "herramienta_id,bodega_id" }
      );
  }

  async function registrarTraspaso(e: React.FormEvent) {
    e.preventDefault();
    if (!traspasar) return;
    setProcesando(true);
    try {
      const sb = getSupabaseClient();

      if (traspasar.por_cantidad) {
        const origen = formTraspaso.bodega_origen_id;
        const destino = formTraspaso.bodega_destino_id;
        const cant = Math.floor(Number(formTraspaso.cantidad) || 0);
        if (!origen) return toast.error("Selecciona la bodega de origen.");
        if (!destino) return toast.error("Selecciona la bodega de destino.");
        if (origen === destino) return toast.error("Origen y destino deben ser distintos.");
        if (cant <= 0) return toast.error("La cantidad a trasladar debe ser mayor a cero.");
        const disp = stockEn(traspasar.id, origen);
        if (cant > disp)
          return toast.error(`No hay tantas unidades en el origen. Disponible: ${disp}.`);

        const r1 = await fijarStock(traspasar.id, origen, disp - cant);
        if (r1.error) throw r1.error;
        const r2 = await fijarStock(traspasar.id, destino, stockEn(traspasar.id, destino) + cant);
        if (r2.error) throw r2.error;
        const mov = await sb.from("movimientos_herramientas").insert({
          herramienta_id: traspasar.id,
          bodega_origen_id: origen,
          bodega_destino_id: destino,
          cantidad: cant,
          motivo: formTraspaso.motivo.trim() || null,
        });
        if (mov.error) throw mov.error;
        toast.exito(`Traslado registrado: ${cant} unidad(es) movida(s).`);
      } else {
        // Herramienta única: mueve la ficha completa
        if (!formTraspaso.bodega_destino_id) return toast.error("Selecciona la bodega de destino.");
        if (formTraspaso.bodega_destino_id === (traspasar.bodega_id ?? ""))
          return toast.error("La herramienta ya está en esa bodega.");
        const origen = traspasar.bodega_id ?? null;
        const e1 = await sb
          .from("herramientas")
          .update({ bodega_id: formTraspaso.bodega_destino_id })
          .eq("id", traspasar.id);
        if (e1.error) throw e1.error;
        const e2 = await sb.from("movimientos_herramientas").insert({
          herramienta_id: traspasar.id,
          bodega_origen_id: origen,
          bodega_destino_id: formTraspaso.bodega_destino_id,
          cantidad: 1,
          motivo: formTraspaso.motivo.trim() || null,
        });
        if (e2.error) throw e2.error;
        toast.exito("Herramienta traspasada de bodega.");
      }

      setTraspasar(null);
      refrescar();
    } catch (err) {
      toast.error(mensajeError(err));
    } finally {
      setProcesando(false);
    }
  }

  async function registrarAjuste(e: React.FormEvent) {
    e.preventDefault();
    if (!ajustar) return;
    const bId = formAjuste.bodega_id;
    const delta = Math.floor(Number(formAjuste.delta) || 0);
    if (!bId) return toast.error("Selecciona la bodega.");
    if (delta === 0) return toast.error("Indica cuántas unidades sumar (+) o restar (−).");
    const actual = stockEn(ajustar.id, bId);
    if (actual + delta < 0)
      return toast.error(`No puedes restar más de lo que hay. En esa bodega hay ${actual}.`);

    setProcesando(true);
    try {
      const sb = getSupabaseClient();
      const r = await fijarStock(ajustar.id, bId, actual + delta);
      if (r.error) throw r.error;
      const nuevoTotal = totalUnidades(ajustar) + delta;
      const up = await sb.from("herramientas").update({ cantidad: nuevoTotal }).eq("id", ajustar.id);
      if (up.error) throw up.error;
      const mov = await sb.from("movimientos_herramientas").insert({
        herramienta_id: ajustar.id,
        bodega_origen_id: delta < 0 ? bId : null,
        bodega_destino_id: delta > 0 ? bId : null,
        cantidad: Math.abs(delta),
        motivo: formAjuste.motivo.trim() || (delta > 0 ? "Ingreso de unidades" : "Baja de unidades"),
      });
      if (mov.error) throw mov.error;
      toast.exito(`Ajuste aplicado (${delta > 0 ? "+" : ""}${delta}).`);
      setAjustar(null);
      refrescar();
    } catch (err) {
      toast.error(mensajeError(err));
    } finally {
      setProcesando(false);
    }
  }

  async function exportarHerramientas() {
    try {
      await exportarExcel(
        "herramientas_insiso",
        herramientas.map((h) => {
          const items = (stockPorHerramienta.get(h.id) ?? []).filter((i) => i.cantidad !== 0);
          const ubicaciones = items
            .map((i) => `${mapBodega.get(i.bodega_id)?.codigo ?? "?"}:${i.cantidad}`)
            .join("; ");
          return {
            codigo: h.codigo,
            nombre: h.nombre,
            categoria: h.categoria ?? "",
            descripcion: h.descripcion ?? "",
            valor: h.valor,
            por_cantidad: h.por_cantidad ? "Sí" : "No",
            cantidad_total: totalUnidades(h),
            ubicaciones,
            bodega: !h.por_cantidad ? mapBodega.get(h.bodega_id ?? "")?.codigo ?? "" : "",
            estado: h.estado,
            arrendada: h.arrendada ? "Sí" : "No",
            valor_arriendo: h.valor_arriendo,
            periodo_arriendo: h.periodo_arriendo ?? "",
          };
        }),
        "Herramientas"
      );
      toast.exito(`Exportadas ${herramientas.length} herramienta(s) a Excel.`);
    } catch (err) {
      toast.error(mensajeError(err));
    }
  }

  async function plantillaHerramientas() {
    try {
      await descargarPlantilla(
        "plantilla_herramientas",
        [
          {
            codigo: "HER-010",
            nombre: "Pala punta",
            categoria: "Manuales",
            descripcion: "",
            valor: 8000,
            por_cantidad: "Sí",
            cantidad: 4,
            bodega: "BOD-CEN",
            arrendada: "No",
            valor_arriendo: 0,
            periodo_arriendo: "",
          },
          {
            codigo: "HER-011",
            nombre: "Taladro percutor Bosch",
            categoria: "Eléctricas",
            descripcion: "",
            valor: 120000,
            por_cantidad: "No",
            cantidad: 1,
            bodega: "BOD-CEN",
            arrendada: "No",
            valor_arriendo: 0,
            periodo_arriendo: "",
          },
        ],
        "Herramientas"
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
    const codigoBodega = new Map(bodegas.map((b) => [b.codigo.trim().toLowerCase(), b.id]));
    let creadas = 0;
    let saltadas = 0;
    let errores = 0;
    let sinBodega = 0;
    setImportando(true);
    try {
      for (const fila of filasImport) {
        const codigo = valorCampo(fila, "codigo", "código", "sku");
        const nombre = valorCampo(fila, "nombre", "herramienta");
        if (!codigo || !nombre) {
          saltadas++;
          continue;
        }
        const cantRaw = valorCampo(fila, "cantidad", "unidades");
        const bodCod = valorCampo(fila, "bodega", "bodega_codigo", "codigo bodega", "código bodega");
        const bodegaId = bodCod ? codigoBodega.get(bodCod.toLowerCase()) ?? null : null;
        const arrendada = esVerdadero(valorCampo(fila, "arrendada", "arriendo"));
        const porCant =
          esVerdadero(valorCampo(fila, "por_cantidad", "por cantidad")) ||
          Number(cantRaw) > 1 ||
          (!!bodCod && !!cantRaw);
        const base = {
          codigo,
          nombre,
          categoria: valorCampo(fila, "categoria", "categoría") || null,
          descripcion: valorCampo(fila, "descripcion", "descripción", "detalle") || null,
          valor: Number(valorCampo(fila, "valor", "precio")) || 0,
          arrendada,
          valor_arriendo: arrendada
            ? Number(valorCampo(fila, "valor_arriendo", "valor arriendo", "arriendo")) || 0
            : 0,
          periodo_arriendo: arrendada
            ? valorCampo(fila, "periodo_arriendo", "periodo", "período") || "Mes"
            : null,
          estado: "DISPONIBLE",
        };
        try {
          if (porCant) {
            const cantidad = Math.max(1, Math.floor(Number(cantRaw) || 1));
            const { data, error } = await sb
              .from("herramientas")
              .insert({ ...base, por_cantidad: true, cantidad, bodega_id: bodegaId })
              .select("id")
              .single();
            if (error) throw error;
            if (bodegaId) {
              const st = await sb
                .from("herramienta_stock")
                .insert({ herramienta_id: (data as { id: string }).id, bodega_id: bodegaId, cantidad });
              if (st.error) throw st.error;
            } else {
              sinBodega++;
            }
          } else {
            const { error } = await sb
              .from("herramientas")
              .insert({ ...base, por_cantidad: false, cantidad: 1, bodega_id: bodegaId });
            if (error) throw error;
          }
          creadas++;
        } catch {
          errores++;
        }
      }
      let msg = `${creadas} herramienta(s) importada(s).`;
      if (saltadas) msg += ` ${saltadas} omitida(s) por datos faltantes.`;
      if (sinBodega) msg += ` ${sinBodega} sin bodega (usa Ajustar para ubicar unidades).`;
      if (errores) msg += ` ${errores} con error (¿código duplicado?).`;
      toast.exito(msg);
      setImportarAbierto(false);
      setFilasImport(null);
      setNombreArchivo("");
      refrescar();
    } finally {
      setImportando(false);
    }
  }

  async function eliminarSeleccionados() {
    const ids = Array.from(msel.sel);
    if (ids.length === 0) return;
    setEliminandoBulk(true);
    const sb = getSupabaseClient();
    let ok = 0;
    let fail = 0;
    for (const id of ids) {
      const { error } = await sb.from("herramientas").delete().eq("id", id);
      if (error) fail++;
      else ok++;
    }
    toast.exito(`${ok} eliminada(s).` + (fail ? ` ${fail} no se pudo(n) eliminar.` : ""));
    setBulkConfirm(false);
    setEliminandoBulk(false);
    msel.salir();
    refrescar();
  }

  async function eliminar() {
    if (!aEliminar) return;
    setProcesando(true);
    try {
      const sb = getSupabaseClient();
      const { error } = await sb.from("herramientas").delete().eq("id", aEliminar.id);
      if (error) throw error;
      toast.exito("Herramienta eliminada.");
      setAEliminar(null);
      refrescar();
    } catch (err) {
      toast.error(mensajeError(err));
    } finally {
      setProcesando(false);
    }
  }

  const dispTraspaso =
    traspasar?.por_cantidad && formTraspaso.bodega_origen_id
      ? stockEn(traspasar.id, formTraspaso.bodega_origen_id)
      : null;
  const actualAjuste = ajustar && formAjuste.bodega_id ? stockEn(ajustar.id, formAjuste.bodega_id) : null;

  return (
    <div>
      <PageHeader
        titulo="Herramientas y Equipos"
        descripcion="Control de activos: herramientas únicas (préstamo/devolución) y herramientas por cantidad (palas, martillos…) con stock por bodega."
        icono={Wrench}
        acciones={
          <div className="flex flex-wrap gap-2">
            <Button variante="outline" onClick={() => setImportarAbierto(true)}>
              <Upload className="h-4 w-4" /> Importar
            </Button>
            <Button variante="outline" onClick={exportarHerramientas} disabled={herramientas.length === 0}>
              <Download className="h-4 w-4" /> Exportar
            </Button>
            <BotonSeleccionar modo={msel.modo} onClick={() => (msel.modo ? msel.salir() : msel.setModo(true))} />
            <Button onClick={abrirNuevo}>
              <Plus className="h-4 w-4" /> Nueva Herramienta
            </Button>
          </div>
        }
      />

      {/* Resumen */}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MiniStat etiqueta="Fichas" valor={resumen.fichas} color="text-primary" />
        <MiniStat etiqueta="Unidades totales" valor={resumen.unidades} color="text-indigo-600" />
        <MiniStat etiqueta="Únicas disponibles" valor={resumen.disponibles} color="text-emerald-600" />
        <MiniStat etiqueta="Prestadas" valor={resumen.prestadas} color="text-blue-600" />
      </div>

      {!cargando && !error && herramientas.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1 max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Buscar por código, nombre o categoría…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} className="pl-9" />
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
          todosMarcados={filtradas.length > 0 && filtradas.every((h) => msel.sel.has(h.id))}
          onTodos={() => msel.seleccionarTodos(filtradas.map((h) => h.id))}
          onEliminar={() => setBulkConfirm(true)}
        />
      )}

      {cargando ? (
        <LoadingState mensaje="Cargando herramientas…" />
      ) : error ? (
        <ErrorState mensaje={error} onReintentar={refrescar} />
      ) : herramientas.length === 0 ? (
        <EmptyState
          titulo="Aún no hay herramientas"
          descripcion="Registra herramientas y equipos para controlar préstamos, devoluciones y cantidades."
          accion={
            <Button onClick={abrirNuevo}>
              <Plus className="h-4 w-4" /> Nueva Herramienta
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtradas.map((h) => {
            const activo = prestamoActivo.get(h.id);
            const proy = activo?.proyecto_id ? mapProyecto.get(activo.proyecto_id) : null;
            const total = totalUnidades(h);
            const chips = desglose(h);
            return (
              <Card key={h.id} className="flex flex-col">
                <CardContent className="flex flex-1 flex-col gap-3 p-5">
                  {msel.modo && (
                    <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-muted-foreground">
                      <CasillaFila marcado={msel.sel.has(h.id)} onChange={() => msel.toggle(h.id)} /> Seleccionar
                    </label>
                  )}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        {h.por_cantidad ? <Boxes className="h-5 w-5" /> : <Hammer className="h-5 w-5" />}
                      </div>
                      <div>
                        <p className="font-mono text-[11px] font-semibold text-muted-foreground">{h.codigo}</p>
                        <p className="font-semibold leading-tight">{h.nombre}</p>
                      </div>
                    </div>
                    {h.por_cantidad ? (
                      <Badge color="bg-indigo-100 text-indigo-700 ring-indigo-200">
                        {formatNumero(total, 0)} u.
                      </Badge>
                    ) : (
                      <Badge color={COLOR_ESTADO_HERRAMIENTA[h.estado]}>
                        {ETIQUETA_ESTADO_HERRAMIENTA[h.estado]}
                      </Badge>
                    )}
                  </div>

                  <div className="space-y-1 text-sm text-muted-foreground">
                    {h.categoria && <p className="text-xs">{h.categoria}</p>}
                    {h.valor > 0 && <p className="text-xs">Valor: {formatCLP(h.valor)}</p>}
                    {h.arrendada && (
                      <p className="text-xs font-medium text-amber-700">
                        Arrendada: {formatCLP(h.valor_arriendo)} / {h.periodo_arriendo ?? "período"}
                      </p>
                    )}
                  </div>

                  {/* Desglose por bodega (solo por cantidad) */}
                  {h.por_cantidad && (
                    <div>
                      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70">
                        Por bodega
                      </p>
                      {chips.length > 0 ? (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {chips.map((c) => (
                            <Badge key={c.codigo} color="bg-slate-100 text-slate-700 ring-slate-200">
                              {c.codigo}: {formatNumero(c.cantidad, 0)}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs italic text-muted-foreground/70">Sin unidades en bodega</p>
                      )}
                    </div>
                  )}

                  {/* Préstamo activo (solo únicas) */}
                  {!h.por_cantidad && h.estado === "PRESTADA" && activo && (
                    <div className="rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-800">
                      <p className="flex items-center gap-1.5 font-medium">
                        <User className="h-3.5 w-3.5" /> {activo.responsable_nombre}
                      </p>
                      {proy && <p className="mt-0.5">Proyecto: {proy.codigo} · {proy.nombre}</p>}
                      <p className="mt-0.5 text-blue-600">Desde {formatFechaHora(activo.fecha_entrega)}</p>
                    </div>
                  )}

                  {/* Acciones */}
                  <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-border pt-3">
                    {h.por_cantidad ? (
                      <>
                        <Button tamano="sm" variante="outline" onClick={() => abrirTraspaso(h)}>
                          <Shuffle className="h-3.5 w-3.5" /> Trasladar
                        </Button>
                        <Button tamano="sm" variante="outline" onClick={() => abrirAjuste(h)}>
                          <SlidersHorizontal className="h-3.5 w-3.5" /> Ajustar
                        </Button>
                      </>
                    ) : (
                      <>
                        {h.estado === "DISPONIBLE" && (
                          <Button tamano="sm" onClick={() => setPrestar(h)}>
                            <LogOut className="h-3.5 w-3.5" /> Prestar
                          </Button>
                        )}
                        <Button tamano="sm" variante="outline" onClick={() => abrirTraspaso(h)}>
                          <Shuffle className="h-3.5 w-3.5" /> Traspasar
                        </Button>
                        {h.estado === "PRESTADA" && (
                          <Button tamano="sm" variante="success" onClick={() => setDevolver(h)}>
                            <LogIn className="h-3.5 w-3.5" /> Devolver
                          </Button>
                        )}
                      </>
                    )}
                    <div className="ml-auto flex items-center gap-1">
                      <Button variante="ghost" tamano="icon" onClick={() => abrirEdicion(h)} aria-label="Editar">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variante="ghost"
                        tamano="icon"
                        onClick={() => setAEliminar(h)}
                        aria-label="Eliminar"
                        disabled={!h.por_cantidad && h.estado === "PRESTADA"}
                        className="text-destructive hover:bg-destructive/10 disabled:opacity-40"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Préstamos activos */}
      {prestamos.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Préstamos Activos ({prestamos.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border">
              {prestamos.map((p) => {
                const h = herramientas.find((x) => x.id === p.herramienta_id);
                const proy = p.proyecto_id ? mapProyecto.get(p.proyecto_id) : null;
                return (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                    <div>
                      <p className="font-medium">
                        {h?.codigo} · {h?.nombre}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {p.responsable_nombre}
                        {proy && ` — ${proy.codigo}`} · desde {formatFechaHora(p.fecha_entrega)}
                      </p>
                    </div>
                    {h && (
                      <Button tamano="sm" variante="success" onClick={() => setDevolver(h)}>
                        <LogIn className="h-3.5 w-3.5" /> Devolver
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Modal crear/editar */}
      <Modal
        abierto={modalAbierto}
        onCerrar={() => setModalAbierto(false)}
        titulo={editando ? "Editar Herramienta" : "Nueva Herramienta"}
        ancho="max-w-lg"
      >
        <form onSubmit={guardar} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Código" required>
              <Input
                value={form.codigo}
                onChange={(e) => setForm({ ...form, codigo: e.target.value })}
                placeholder="HER-001"
              />
            </Field>
            <Field label="Categoría">
              <Input
                value={form.categoria}
                onChange={(e) => setForm({ ...form, categoria: e.target.value })}
                placeholder="Manuales, Eléctricas…"
              />
            </Field>
          </div>
          <Field label="Nombre" required>
            <Input
              value={form.nombre}
              onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              placeholder="Pala punta / Taladro Bosch"
            />
          </Field>
          <Field label="Descripción">
            <Textarea
              value={form.descripcion}
              onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
            />
          </Field>

          {/* Tipo de manejo: por cantidad vs única (solo se define al crear) */}
          {!editando && (
            <div className="rounded-lg border border-border p-3">
              <label className="flex items-start gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={form.por_cantidad}
                  onChange={(e) => setForm({ ...form, por_cantidad: e.target.checked })}
                  className="mt-0.5 h-4 w-4 rounded border-border"
                />
                <span>
                  Manejar por cantidad
                  <span className="block text-xs font-normal text-muted-foreground">
                    Para herramientas que se repiten (palas, martillos, llaves). Una sola ficha con varias
                    unidades repartidas por bodega.
                  </span>
                </span>
              </label>
              {form.por_cantidad && (
                <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Cantidad inicial" required>
                    <Input
                      type="number"
                      min="1"
                      step="1"
                      value={form.cantidad}
                      onChange={(e) => setForm({ ...form, cantidad: e.target.value })}
                      placeholder="4"
                    />
                  </Field>
                  <Field label="Bodega inicial" required>
                    <Select
                      value={form.bodega_id}
                      onChange={(e) => setForm({ ...form, bodega_id: e.target.value })}
                    >
                      <option value="">— Selecciona —</option>
                      {bodegas.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.codigo} · {b.nombre}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
              )}
            </div>
          )}

          {editando?.por_cantidad && (
            <p className="rounded-lg bg-indigo-50 px-3 py-2 text-xs text-indigo-700">
              Esta herramienta se maneja por cantidad. Para cambiar unidades usa <b>Ajustar</b> (sumar/restar)
              o <b>Trasladar</b> (mover entre bodegas) desde su tarjeta.
            </p>
          )}

          {/* Valor + (bodega/estado solo para únicas) */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Valor (CLP)">
              <Input
                type="number"
                min="0"
                step="1"
                value={form.valor}
                onChange={(e) => setForm({ ...form, valor: e.target.value })}
              />
            </Field>
            {!form.por_cantidad && (
              <>
                <Field label="Bodega">
                  <Select value={form.bodega_id} onChange={(e) => setForm({ ...form, bodega_id: e.target.value })}>
                    <option value="">— Sin asignar —</option>
                    {bodegas.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.codigo} · {b.nombre}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Estado" hint="«Prestada» se fija al prestar">
                  <Select
                    value={form.estado}
                    onChange={(e) => setForm({ ...form, estado: e.target.value as EstadoHerramienta })}
                  >
                    {ESTADOS_HERRAMIENTA.filter((s) => s !== "PRESTADA").map((s) => (
                      <option key={s} value={s}>
                        {ETIQUETA_ESTADO_HERRAMIENTA[s]}
                      </option>
                    ))}
                  </Select>
                </Field>
              </>
            )}
          </div>

          {/* Arriendo */}
          <div className="space-y-3 rounded-lg border border-border p-3">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={form.arrendada}
                onChange={(e) => setForm({ ...form, arrendada: e.target.checked })}
                className="h-4 w-4 rounded border-border"
              />
              Esta herramienta es arrendada
            </label>
            {form.arrendada && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Valor de arriendo (CLP)">
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    value={form.valor_arriendo}
                    onChange={(e) => setForm({ ...form, valor_arriendo: e.target.value })}
                  />
                </Field>
                <Field label="Período">
                  <Select
                    value={form.periodo_arriendo}
                    onChange={(e) => setForm({ ...form, periodo_arriendo: e.target.value })}
                  >
                    <option value="Día">Por día</option>
                    <option value="Mes">Por mes</option>
                    <option value="Año">Por año</option>
                  </Select>
                </Field>
              </div>
            )}
          </div>
          <ModalFooter>
            <Button type="button" variante="outline" onClick={() => setModalAbierto(false)}>
              Cancelar
            </Button>
            <Button type="submit" cargando={guardando}>
              {editando ? "Guardar cambios" : "Crear herramienta"}
            </Button>
          </ModalFooter>
        </form>
      </Modal>

      {/* Modal préstamo (checkout) */}
      <Modal
        abierto={!!prestar}
        onCerrar={() => setPrestar(null)}
        titulo="Registrar Préstamo (Checkout)"
        descripcion={prestar ? `${prestar.codigo} · ${prestar.nombre}` : undefined}
        ancho="max-w-md"
      >
        <form onSubmit={registrarPrestamo} className="space-y-4">
          <Field label="Responsable que recibe" required>
            <Input
              value={formPrestamo.responsable_nombre}
              onChange={(e) => setFormPrestamo({ ...formPrestamo, responsable_nombre: e.target.value })}
              placeholder="Juan Pérez (Maestro)"
            />
          </Field>
          <Field label="Proyecto" hint="Opcional">
            <Combobox
              value={formPrestamo.proyecto_id}
              onChange={(id) => setFormPrestamo({ ...formPrestamo, proyecto_id: id })}
              placeholder="Escribe para buscar proyecto…"
              vacioLabel="— Sin proyecto —"
              items={proyectos.map((p) => ({ id: p.id, label: `${p.codigo} · ${p.nombre}`, buscar: `${p.codigo} ${p.nombre}` }))}
            />
          </Field>
          <Field label="Observaciones">
            <Textarea
              value={formPrestamo.observaciones}
              onChange={(e) => setFormPrestamo({ ...formPrestamo, observaciones: e.target.value })}
            />
          </Field>
          <ModalFooter>
            <Button type="button" variante="outline" onClick={() => setPrestar(null)}>
              Cancelar
            </Button>
            <Button type="submit" cargando={procesando}>
              <LogOut className="h-4 w-4" /> Entregar herramienta
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
        titulo="Importar herramientas desde Excel"
        descripcion="Carga masiva. Descarga la plantilla para ver las columnas."
        ancho="max-w-lg"
      >
        <div className="space-y-4">
          <div className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            Columnas: <b>codigo</b>, <b>nombre</b>, categoria, descripcion, valor, por_cantidad (Sí/No),
            cantidad, bodega (código), arrendada, valor_arriendo, periodo_arriendo.
            Obligatorias: <b>codigo</b> y <b>nombre</b>. Si pones <b>cantidad</b> y <b>bodega</b>, se crea como
            “por cantidad”.
          </div>
          <Button type="button" variante="outline" tamano="sm" onClick={plantillaHerramientas}>
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

      {/* Confirmar devolución */}
      <ConfirmDialog
        abierto={!!devolver}
        titulo="Registrar devolución (Check-in)"
        mensaje={`¿Confirmar la devolución de "${devolver?.nombre}"? Volverá a estar disponible.`}
        textoConfirmar="Confirmar devolución"
        cargando={procesando}
        onConfirmar={registrarDevolucion}
        onCancelar={() => setDevolver(null)}
      />

      {/* Confirmar eliminación */}
      <ConfirmDialog
        abierto={!!aEliminar}
        titulo="Eliminar herramienta"
        mensaje={`¿Eliminar "${aEliminar?.nombre}"? Se borrará también su historial de préstamos y su stock por bodega.`}
        cargando={procesando}
        onConfirmar={eliminar}
        onCancelar={() => setAEliminar(null)}
      />

      <ConfirmDialog
        abierto={bulkConfirm}
        titulo="Eliminar seleccionadas"
        mensaje={`¿Eliminar ${msel.sel.size} herramienta(s) seleccionada(s)? Se borrará su historial y stock. Esta acción no se puede deshacer.`}
        cargando={eliminandoBulk}
        onConfirmar={eliminarSeleccionados}
        onCancelar={() => setBulkConfirm(false)}
      />

      {/* Modal traslado / traspaso */}
      <Modal
        abierto={!!traspasar}
        onCerrar={() => setTraspasar(null)}
        titulo={traspasar?.por_cantidad ? "Trasladar unidades entre bodegas" : "Traspasar herramienta de bodega"}
        descripcion={traspasar ? `${traspasar.codigo} · ${traspasar.nombre}` : undefined}
        ancho="max-w-md"
      >
        <form onSubmit={registrarTraspaso} className="space-y-4">
          {traspasar?.por_cantidad ? (
            <>
              <Field
                label="Bodega de origen"
                required
                hint={dispTraspaso != null ? `Disponible: ${formatNumero(dispTraspaso, 0)} u.` : undefined}
              >
                <Select
                  value={formTraspaso.bodega_origen_id}
                  onChange={(e) => setFormTraspaso({ ...formTraspaso, bodega_origen_id: e.target.value })}
                >
                  <option value="">— Selecciona —</option>
                  {(stockPorHerramienta.get(traspasar.id) ?? [])
                    .filter((i) => i.cantidad > 0)
                    .map((i) => {
                      const b = mapBodega.get(i.bodega_id);
                      return (
                        <option key={i.bodega_id} value={i.bodega_id}>
                          {b ? `${b.codigo} · ${b.nombre}` : i.bodega_id} ({i.cantidad} u.)
                        </option>
                      );
                    })}
                </Select>
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Bodega de destino" required>
                  <Select
                    value={formTraspaso.bodega_destino_id}
                    onChange={(e) => setFormTraspaso({ ...formTraspaso, bodega_destino_id: e.target.value })}
                  >
                    <option value="">— Selecciona —</option>
                    {bodegas
                      .filter((b) => b.id !== formTraspaso.bodega_origen_id)
                      .map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.codigo} · {b.nombre}
                        </option>
                      ))}
                  </Select>
                </Field>
                <Field label="Cantidad a trasladar" required>
                  <Input
                    type="number"
                    min="1"
                    step="1"
                    value={formTraspaso.cantidad}
                    onChange={(e) => setFormTraspaso({ ...formTraspaso, cantidad: e.target.value })}
                    placeholder="2"
                  />
                </Field>
              </div>
            </>
          ) : (
            <>
              <Field label="Bodega actual">
                <Input
                  value={
                    traspasar?.bodega_id
                      ? mapBodega.get(traspasar.bodega_id)?.nombre ?? "—"
                      : "Sin asignar"
                  }
                  disabled
                />
              </Field>
              <Field label="Bodega de destino" required>
                <Select
                  value={formTraspaso.bodega_destino_id}
                  onChange={(e) => setFormTraspaso({ ...formTraspaso, bodega_destino_id: e.target.value })}
                >
                  <option value="">— Selecciona —</option>
                  {bodegas
                    .filter((b) => b.id !== traspasar?.bodega_id)
                    .map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.codigo} · {b.nombre}
                      </option>
                    ))}
                </Select>
              </Field>
            </>
          )}
          <Field label="Motivo / Observación">
            <Textarea
              value={formTraspaso.motivo}
              onChange={(e) => setFormTraspaso({ ...formTraspaso, motivo: e.target.value })}
            />
          </Field>
          <ModalFooter>
            <Button type="button" variante="outline" onClick={() => setTraspasar(null)}>
              Cancelar
            </Button>
            <Button type="submit" cargando={procesando}>
              <Shuffle className="h-4 w-4" /> {traspasar?.por_cantidad ? "Trasladar" : "Traspasar"}
            </Button>
          </ModalFooter>
        </form>
      </Modal>

      {/* Modal ajuste de cantidad */}
      <Modal
        abierto={!!ajustar}
        onCerrar={() => setAjustar(null)}
        titulo="Ajustar cantidad"
        descripcion={ajustar ? `${ajustar.codigo} · ${ajustar.nombre}` : undefined}
        ancho="max-w-md"
      >
        <form onSubmit={registrarAjuste} className="space-y-4">
          <Field
            label="Bodega"
            required
            hint={actualAjuste != null ? `Actual: ${formatNumero(actualAjuste, 0)} u.` : undefined}
          >
            <Select
              value={formAjuste.bodega_id}
              onChange={(e) => setFormAjuste({ ...formAjuste, bodega_id: e.target.value })}
            >
              <option value="">— Selecciona —</option>
              {bodegas.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.codigo} · {b.nombre}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Unidades a sumar (+) o restar (−)"
            hint="Ej: 2 si compraste 2 más; -1 si diste de baja una."
            required
          >
            <Input
              type="number"
              step="1"
              value={formAjuste.delta}
              onChange={(e) => setFormAjuste({ ...formAjuste, delta: e.target.value })}
              placeholder="+2 ó -1"
            />
          </Field>
          <Field label="Motivo / Observación">
            <Textarea
              value={formAjuste.motivo}
              onChange={(e) => setFormAjuste({ ...formAjuste, motivo: e.target.value })}
              placeholder="Compra, baja por pérdida/rotura, inventario…"
            />
          </Field>
          <ModalFooter>
            <Button type="button" variante="outline" onClick={() => setAjustar(null)}>
              Cancelar
            </Button>
            <Button type="submit" cargando={procesando}>
              <SlidersHorizontal className="h-4 w-4" /> Aplicar ajuste
            </Button>
          </ModalFooter>
        </form>
      </Modal>
    </div>
  );
}

function MiniStat({ etiqueta, valor, color }: { etiqueta: string; valor: number; color: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{etiqueta}</p>
        <p className={cn("text-2xl font-bold tracking-tight", color)}>{valor}</p>
      </CardContent>
    </Card>
  );
}
