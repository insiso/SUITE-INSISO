"use client";

import * as React from "react";
import {
  ArrowLeftRight,
  Plus,
  ArrowDownToLine,
  ArrowUpFromLine,
  Shuffle,
  Search,
  Download,
} from "lucide-react";
import { exportarExcel } from "@/lib/excel";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useConsulta } from "@/lib/hooks";
import { mensajeError, formatNumero, formatFechaHora, formatCLP } from "@/lib/utils";
import type {
  Bodega,
  Material,
  MovimientoKardex,
  MovimientoHerramienta,
  Proyecto,
  TipoMovimiento,
} from "@/lib/types";
import {
  TIPOS_MOVIMIENTO,
  ETIQUETA_MOVIMIENTO,
  COLOR_MOVIMIENTO,
} from "@/lib/constants";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Field, Select, Textarea } from "@/components/ui/field";
import { Combobox } from "@/components/ui/combobox";
import { Modal, ModalFooter } from "@/components/ui/modal";
import { ConfirmDialog } from "@/components/ui/confirm";
import { TableContainer, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { LoadingState, ErrorState, EmptyState } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";

type FormState = {
  tipo: TipoMovimiento;
  material_id: string;
  cantidad: string;
  costo_unitario: string;
  bodega_origen_id: string;
  bodega_destino_id: string;
  proyecto_id: string;
  concepto: string;
};

const FORM_VACIO: FormState = {
  tipo: "ENTRADA",
  material_id: "",
  cantidad: "",
  costo_unitario: "0",
  bodega_origen_id: "",
  bodega_destino_id: "",
  proyecto_id: "",
  concepto: "",
};

const ICONO_TIPO: Record<TipoMovimiento, React.ComponentType<{ className?: string }>> = {
  ENTRADA: ArrowDownToLine,
  SALIDA: ArrowUpFromLine,
  TRASPASO: Shuffle,
  AJUSTE: ArrowLeftRight,
};

export default function MovimientosPage() {
  const toast = useToast();

  async function exportar() {
    try {
      await exportarExcel("movimientos_insiso", filtrados.map((m) => {
        const mat = mapMaterial.get(m.material_id);
        const origen = m.bodega_origen_id ? mapBodega.get(m.bodega_origen_id) : null;
        const destino = m.bodega_destino_id ? mapBodega.get(m.bodega_destino_id) : null;
        const proy = m.proyecto_id ? mapProyecto.get(m.proyecto_id) : null;
        return {
          folio: m.folio,
          fecha: formatFechaHora(m.fecha),
          tipo: m.tipo,
          sku: mat?.sku ?? "",
          material: mat?.descripcion ?? "",
          cantidad: m.cantidad,
          unidad: mat?.unidad_medida ?? "",
          origen: origen?.codigo ?? "",
          destino: destino?.codigo ?? "",
          proyecto: proy?.codigo ?? "",
          concepto: m.concepto ?? "",
        };
      }), "Movimientos");
      toast.exito(`Exportados ${filtrados.length} movimiento(s) a Excel.`);
    } catch (err) {
      toast.error(mensajeError(err));
    }
  }
  const [modalAbierto, setModalAbierto] = React.useState(false);
  const [form, setForm] = React.useState<FormState>(FORM_VACIO);
  const [guardando, setGuardando] = React.useState(false);
  const [filtroTipo, setFiltroTipo] = React.useState<"" | TipoMovimiento>("");
  const [aRevertir, setARevertir] = React.useState<MovimientoKardex | null>(null);
  const [revirtiendo, setRevirtiendo] = React.useState(false);
  const [busqueda, setBusqueda] = React.useState("");

  const { datos, cargando, error, refrescar } = useConsulta(async () => {
    const sb = getSupabaseClient();
    const [movs, materiales, bodegas, proyectos, stock, movsHerr, herramientas] = await Promise.all([
      sb.from("movimientos_kardex").select("*").order("fecha", { ascending: false }).limit(300),
      sb.from("materiales").select("*").eq("activo", true).order("descripcion"),
      sb.from("bodegas").select("*").eq("activo", true).order("codigo"),
      sb.from("proyectos").select("id, codigo, nombre").order("codigo"),
      sb.from("inventario_stock").select("material_id, bodega_id, cantidad"),
      sb.from("movimientos_herramientas").select("*").order("fecha", { ascending: false }).limit(200),
      sb.from("herramientas").select("id, codigo, nombre"),
    ]);
    if (movs.error) throw movs.error;
    if (materiales.error) throw materiales.error;
    if (bodegas.error) throw bodegas.error;
    if (proyectos.error) throw proyectos.error;
    if (stock.error) throw stock.error;
    if (movsHerr.error) throw movsHerr.error;
    if (herramientas.error) throw herramientas.error;
    return {
      movimientos: movs.data as MovimientoKardex[],
      materiales: materiales.data as Material[],
      bodegas: bodegas.data as Bodega[],
      proyectos: proyectos.data as Pick<Proyecto, "id" | "codigo" | "nombre">[],
      stock: stock.data as { material_id: string; bodega_id: string; cantidad: number }[],
      movsHerr: (movsHerr.data ?? []) as MovimientoHerramienta[],
      herramientas: (herramientas.data ?? []) as { id: string; codigo: string; nombre: string }[],
    };
  });

  const movimientos = datos?.movimientos ?? [];

  // Ids de movimientos que ya fueron revertidos (aparecen como reversa_de de otro)
  const revertidos = React.useMemo(
    () => new Set(movimientos.filter((x) => x.reversa_de).map((x) => x.reversa_de as string)),
    [movimientos]
  );
  const materiales = datos?.materiales ?? [];
  const bodegas = datos?.bodegas ?? [];

  // Bodeguero de bodega única: si sólo hay una bodega visible, se preselecciona.
  React.useEffect(() => {
    if (bodegas.length === 1) {
      const b = bodegas[0].id;
      setForm((f) =>
        f.bodega_origen_id || f.bodega_destino_id
          ? f
          : { ...f, bodega_origen_id: b, bodega_destino_id: b }
      );
    }
  }, [bodegas]);
  const proyectos = datos?.proyectos ?? [];
  const stock = datos?.stock ?? [];
  const movsHerr = datos?.movsHerr ?? [];
  const herramientasMap = React.useMemo(
    () => new Map((datos?.herramientas ?? []).map((h) => [h.id, h])),
    [datos]
  );

  const mapMaterial = React.useMemo(
    () => new Map(materiales.map((m) => [m.id, m])),
    [materiales]
  );
  const mapBodega = React.useMemo(() => new Map(bodegas.map((b) => [b.id, b])), [bodegas]);
  const mapProyecto = React.useMemo(() => new Map(proyectos.map((p) => [p.id, p])), [proyectos]);
  const mapStock = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const s of stock) m.set(`${s.material_id}|${s.bodega_id}`, s.cantidad);
    return m;
  }, [stock]);

  const filtrados = movimientos.filter((m) => {
    if (filtroTipo && m.tipo !== filtroTipo) return false;
    const q = busqueda.toLowerCase().trim();
    if (!q) return true;
    const mat = mapMaterial.get(m.material_id);
    const proy = m.proyecto_id ? mapProyecto.get(m.proyecto_id) : null;
    return (
      (mat?.sku ?? "").toLowerCase().includes(q) ||
      (mat?.descripcion ?? "").toLowerCase().includes(q) ||
      (m.concepto ?? "").toLowerCase().includes(q) ||
      String(m.folio).includes(q) ||
      (proy?.codigo ?? "").toLowerCase().includes(q)
    );
  });

  function abrirNuevo(tipo: TipoMovimiento = "ENTRADA") {
    setForm({ ...FORM_VACIO, tipo });
    setModalAbierto(true);
  }

  function onMaterialChange(id: string) {
    const mat = mapMaterial.get(id);
    setForm((f) => ({
      ...f,
      material_id: id,
      costo_unitario: mat ? String(mat.precio_unitario) : f.costo_unitario,
    }));
  }

  function stockDisponible(materialId: string, bodegaId: string) {
    return mapStock.get(`${materialId}|${bodegaId}`) ?? 0;
  }

  // Revierte un movimiento creando el movimiento contrario (intercambia origen/destino).
  async function revertir(m: MovimientoKardex) {
    setRevirtiendo(true);
    try {
      const sb = getSupabaseClient();
      const nuevoOrigen = m.bodega_destino_id; // sale de donde había entrado
      const nuevoDestino = m.bodega_origen_id; // entra a donde había salido
      const nuevoTipo: TipoMovimiento =
        nuevoOrigen && nuevoDestino ? "TRASPASO" : nuevoOrigen ? "SALIDA" : "ENTRADA";
      if (nuevoOrigen) {
        const disp = stockDisponible(m.material_id, nuevoOrigen);
        if (m.cantidad > disp) {
          toast.error(
            `No se puede revertir: stock insuficiente en la bodega de salida (disponible ${formatNumero(disp, 0)}).`
          );
          setARevertir(null);
          setRevirtiendo(false);
          return;
        }
      }
      const { error } = await sb.from("movimientos_kardex").insert({
        tipo: nuevoTipo,
        material_id: m.material_id,
        cantidad: m.cantidad,
        costo_unitario: m.costo_unitario ?? 0,
        bodega_origen_id: nuevoOrigen,
        bodega_destino_id: nuevoDestino,
        proyecto_id: m.proyecto_id ?? null,
        concepto: `Reversa del folio #${m.folio}` + (m.concepto ? ` — ${m.concepto}` : ""),
        reversa_de: m.id,
      });
      if (error) throw error;
      toast.exito("Movimiento revertido. El stock se ajustó automáticamente.");
      setARevertir(null);
      refrescar();
    } catch (err) {
      toast.error(mensajeError(err));
    } finally {
      setRevirtiendo(false);
    }
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    const cantidad = Number(form.cantidad);
    if (!form.material_id) return toast.error("Selecciona un material.");
    if (!cantidad || cantidad <= 0) return toast.error("La cantidad debe ser mayor a cero.");

    if (form.tipo === "ENTRADA" && !form.bodega_destino_id)
      return toast.error("Selecciona la bodega de destino.");
    if (form.tipo === "SALIDA" && !form.bodega_origen_id)
      return toast.error("Selecciona la bodega de origen.");
    if (form.tipo === "TRASPASO") {
      if (!form.bodega_origen_id || !form.bodega_destino_id)
        return toast.error("Indica bodega de origen y destino.");
      if (form.bodega_origen_id === form.bodega_destino_id)
        return toast.error("El origen y destino deben ser bodegas distintas.");
    }

    // Validación de stock disponible en origen
    if (form.tipo === "SALIDA" || form.tipo === "TRASPASO") {
      const disp = stockDisponible(form.material_id, form.bodega_origen_id);
      if (cantidad > disp) {
        return toast.error(
          `Stock insuficiente en origen. Disponible: ${formatNumero(disp, 0)}.`
        );
      }
    }

    setGuardando(true);
    try {
      const sb = getSupabaseClient();
      const payload = {
        tipo: form.tipo,
        material_id: form.material_id,
        cantidad,
        costo_unitario: Number(form.costo_unitario) || 0,
        bodega_origen_id:
          form.tipo === "ENTRADA" ? null : form.bodega_origen_id || null,
        bodega_destino_id:
          form.tipo === "SALIDA" ? null : form.bodega_destino_id || null,
        proyecto_id: form.proyecto_id || null,
        concepto: form.concepto.trim() || null,
      };
      const { error } = await sb.from("movimientos_kardex").insert(payload);
      if (error) throw error;
      // Si es una ENTRADA con costo, ese valor pasa a ser el precio unitario del material
      // (costo del último ingreso) para que el inventario se valorice.
      if (form.tipo === "ENTRADA" && Number(form.costo_unitario) > 0) {
        await sb
          .from("materiales")
          .update({ precio_unitario: Number(form.costo_unitario) })
          .eq("id", form.material_id);
      }
      toast.exito("Movimiento registrado. El stock fue actualizado.");
      setModalAbierto(false);
      refrescar();
    } catch (err) {
      toast.error(mensajeError(err));
    } finally {
      setGuardando(false);
    }
  }

  const Icono = ICONO_TIPO[form.tipo];

  return (
    <div>
      <PageHeader
        titulo="Movimientos y Kardex"
        descripcion="Registro transaccional estricto: entradas, salidas y traspasos entre bodegas."
        icono={ArrowLeftRight}
        acciones={
          <div className="flex gap-2">
            <Button variante="outline" onClick={exportar} disabled={filtrados.length === 0}>
              <Download className="h-4 w-4" /> Exportar
            </Button>
            <Button variante="outline" onClick={() => abrirNuevo("ENTRADA")}>
              <ArrowDownToLine className="h-4 w-4" /> Entrada
            </Button>
            <Button onClick={() => abrirNuevo("ENTRADA")}>
              <Plus className="h-4 w-4" /> Nuevo Movimiento
            </Button>
          </div>
        }
      />

      {movimientos.length > 0 && (
        <div className="mb-4 relative max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Buscar por material, SKU, folio, proyecto o concepto…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} className="pl-9" />
        </div>
      )}

      {/* Filtros por tipo */}
      <div className="mb-4 flex flex-wrap gap-2">
        <Button
          variante={filtroTipo === "" ? "primary" : "outline"}
          tamano="sm"
          onClick={() => setFiltroTipo("")}
        >
          Todos
        </Button>
        {TIPOS_MOVIMIENTO.map((t) => (
          <Button
            key={t}
            variante={filtroTipo === t ? "primary" : "outline"}
            tamano="sm"
            onClick={() => setFiltroTipo(t)}
          >
            {ETIQUETA_MOVIMIENTO[t]}
          </Button>
        ))}
      </div>

      {cargando ? (
        <LoadingState mensaje="Cargando movimientos…" />
      ) : error ? (
        <ErrorState mensaje={error} onReintentar={refrescar} />
      ) : filtrados.length === 0 ? (
        <EmptyState
          titulo="Sin movimientos registrados"
          descripcion="Registra una entrada de mercancías para iniciar el Kardex."
          accion={
            <Button onClick={() => abrirNuevo("ENTRADA")}>
              <Plus className="h-4 w-4" /> Nuevo Movimiento
            </Button>
          }
        />
      ) : (
        <TableContainer>
          <THead>
            <TR>
              <TH>Folio</TH>
              <TH>Fecha</TH>
              <TH>Tipo</TH>
              <TH>Material</TH>
              <TH className="text-right">Cantidad</TH>
              <TH>Origen</TH>
              <TH>Destino</TH>
              <TH>Proyecto / Concepto</TH>
              <TH className="text-right">Acción</TH>
            </TR>
          </THead>
          <TBody>
            {filtrados.map((m) => {
              const mat = mapMaterial.get(m.material_id);
              const origen = m.bodega_origen_id ? mapBodega.get(m.bodega_origen_id) : null;
              const destino = m.bodega_destino_id ? mapBodega.get(m.bodega_destino_id) : null;
              const proy = m.proyecto_id ? mapProyecto.get(m.proyecto_id) : null;
              return (
                <TR key={m.id}>
                  <TD className="font-mono text-xs text-muted-foreground">#{m.folio}</TD>
                  <TD className="whitespace-nowrap text-xs">{formatFechaHora(m.fecha)}</TD>
                  <TD>
                    <Badge color={COLOR_MOVIMIENTO[m.tipo]}>{m.tipo}</Badge>
                  </TD>
                  <TD>
                    <p className="font-medium leading-tight">{mat?.descripcion ?? "—"}</p>
                    <p className="font-mono text-[11px] text-muted-foreground">{mat?.sku}</p>
                  </TD>
                  <TD className="text-right font-semibold tabular-nums">
                    {formatNumero(m.cantidad, 0)} {mat?.unidad_medida}
                  </TD>
                  <TD className="text-xs">{origen ? origen.codigo : "—"}</TD>
                  <TD className="text-xs">{destino ? destino.codigo : "—"}</TD>
                  <TD className="max-w-[220px] text-xs text-muted-foreground">
                    {proy && <span className="font-medium text-foreground">{proy.codigo} · </span>}
                    {m.concepto ?? (proy ? "" : "—")}
                  </TD>
                  <TD className="text-right">
                    {m.reversa_de ? (
                      <Badge color="bg-violet-100 text-violet-700 ring-violet-200">Reversa</Badge>
                    ) : revertidos.has(m.id) ? (
                      <Badge color="bg-slate-100 text-slate-600 ring-slate-200">Revertido</Badge>
                    ) : (
                      <Button
                        variante="ghost"
                        tamano="sm"
                        onClick={() => setARevertir(m)}
                        className="text-amber-600 hover:bg-amber-50"
                      >
                        Revertir
                      </Button>
                    )}
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </TableContainer>
      )}

      {/* Traspasos de herramientas entre bodegas */}
      {movsHerr.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-3 text-sm font-semibold text-muted-foreground">
            Traspasos de herramientas entre bodegas
          </h2>
          <TableContainer>
            <THead>
              <TR>
                <TH>Fecha</TH>
                <TH>Herramienta</TH>
                <TH>Origen</TH>
                <TH>Destino</TH>
                <TH className="text-right">Cant.</TH>
                <TH>Motivo</TH>
              </TR>
            </THead>
            <TBody>
              {movsHerr.map((m) => {
                const h = herramientasMap.get(m.herramienta_id);
                const origen = m.bodega_origen_id ? mapBodega.get(m.bodega_origen_id) : null;
                const destino = m.bodega_destino_id ? mapBodega.get(m.bodega_destino_id) : null;
                return (
                  <TR key={m.id}>
                    <TD className="whitespace-nowrap text-xs">{formatFechaHora(m.fecha)}</TD>
                    <TD>
                      <p className="font-medium leading-tight">{h?.nombre ?? "—"}</p>
                      <p className="font-mono text-[11px] text-muted-foreground">{h?.codigo}</p>
                    </TD>
                    <TD className="text-xs">{origen ? origen.codigo : "—"}</TD>
                    <TD className="text-xs">{destino ? destino.codigo : "—"}</TD>
                    <TD className="text-right font-semibold tabular-nums">{formatNumero(m.cantidad ?? 1, 0)}</TD>
                    <TD className="max-w-[260px] text-xs text-muted-foreground">{m.motivo ?? "—"}</TD>
                  </TR>
                );
              })}
            </TBody>
          </TableContainer>
        </div>
      )}

      {/* Modal nuevo movimiento */}
      <Modal
        abierto={modalAbierto}
        onCerrar={() => setModalAbierto(false)}
        titulo="Registrar Movimiento"
        descripcion="El stock de las bodegas se actualiza automáticamente."
        ancho="max-w-xl"
      >
        <form onSubmit={guardar} className="space-y-4">
          {/* Tipo de movimiento */}
          <div className="grid grid-cols-3 gap-2">
            {TIPOS_MOVIMIENTO.map((t) => {
              const I = ICONO_TIPO[t];
              const activo = form.tipo === t;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setForm({ ...form, tipo: t })}
                  className={
                    "flex flex-col items-center gap-1.5 rounded-lg border p-3 text-xs font-medium transition-colors " +
                    (activo
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-border text-muted-foreground hover:bg-accent")
                  }
                >
                  <I className="h-5 w-5" />
                  {t}
                </button>
              );
            })}
          </div>
          <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
            <Icono className="mr-1 inline h-3.5 w-3.5" />
            {ETIQUETA_MOVIMIENTO[form.tipo]}
          </p>

          <Field label="Material" required>
            <Combobox
              value={form.material_id}
              onChange={onMaterialChange}
              placeholder="Escribe para buscar por SKU o nombre…"
              items={materiales.map((m) => ({
                id: m.id,
                label: `${m.sku} · ${m.descripcion}`,
                buscar: `${m.sku} ${m.descripcion}`,
              }))}
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Cantidad" required>
              <Input
                type="number"
                min="0"
                step="any"
                value={form.cantidad}
                onChange={(e) => setForm({ ...form, cantidad: e.target.value })}
                placeholder="0"
              />
            </Field>
            <Field label="Costo unitario (CLP)" hint="Se valoriza el movimiento">
              <Input
                type="number"
                min="0"
                step="1"
                value={form.costo_unitario}
                onChange={(e) => setForm({ ...form, costo_unitario: e.target.value })}
              />
            </Field>
          </div>

          {/* Bodegas según tipo */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {(form.tipo === "SALIDA" || form.tipo === "TRASPASO") && (
              <Field
                label="Bodega de origen"
                required
                hint={
                  form.material_id && form.bodega_origen_id
                    ? `Disponible: ${formatNumero(
                        stockDisponible(form.material_id, form.bodega_origen_id),
                        0
                      )}`
                    : undefined
                }
              >
                <Select
                  value={form.bodega_origen_id}
                  onChange={(e) => setForm({ ...form, bodega_origen_id: e.target.value })}
                >
                  <option value="">— Selecciona —</option>
                  {bodegas.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.codigo} · {b.nombre}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            {(form.tipo === "ENTRADA" || form.tipo === "TRASPASO") && (
              <Field label="Bodega de destino" required>
                <Select
                  value={form.bodega_destino_id}
                  onChange={(e) => setForm({ ...form, bodega_destino_id: e.target.value })}
                >
                  <option value="">— Selecciona —</option>
                  {bodegas.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.codigo} · {b.nombre}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
          </div>

          {form.tipo === "SALIDA" && (
            <Field label="Imputar a proyecto" hint="Opcional · genera gasto real de materiales">
              <Combobox
                value={form.proyecto_id}
                onChange={(id) => setForm({ ...form, proyecto_id: id })}
                placeholder="Escribe para buscar proyecto…"
                vacioLabel="— Sin proyecto —"
                items={proyectos.map((p) => ({ id: p.id, label: `${p.codigo} · ${p.nombre}`, buscar: `${p.codigo} ${p.nombre}` }))}
              />
            </Field>
          )}

          <Field label="Concepto / Observación">
            <Textarea
              value={form.concepto}
              onChange={(e) => setForm({ ...form, concepto: e.target.value })}
              placeholder="Ingreso por orden de compra N°…, consumo en fundaciones, etc."
            />
          </Field>

          {form.material_id && Number(form.cantidad) > 0 && (
            <p className="rounded-lg border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              Valor del movimiento:{" "}
              <span className="font-semibold text-foreground">
                {formatCLP(Number(form.cantidad) * (Number(form.costo_unitario) || 0))}
              </span>
            </p>
          )}

          <ModalFooter>
            <Button type="button" variante="outline" onClick={() => setModalAbierto(false)}>
              Cancelar
            </Button>
            <Button type="submit" cargando={guardando}>
              Registrar movimiento
            </Button>
          </ModalFooter>
        </form>
      </Modal>

      <ConfirmDialog
        abierto={!!aRevertir}
        titulo="Revertir movimiento"
        mensaje={
          aRevertir
            ? `Se creará un movimiento contrario que devuelve el stock del folio #${aRevertir.folio}. El movimiento original quedará marcado como revertido. ¿Continuar?`
            : ""
        }
        textoConfirmar="Revertir"
        cargando={revirtiendo}
        onConfirmar={() => aRevertir && revertir(aRevertir)}
        onCancelar={() => setARevertir(null)}
      />
    </div>
  );
}
