"use client";

import * as React from "react";
import { Boxes, Search, AlertTriangle, Layers, CircleDollarSign, Download } from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useConsulta } from "@/lib/hooks";
import { formatCLP, formatNumero, cn, mensajeError } from "@/lib/utils";
import { exportarExcel } from "@/lib/excel";
import { useToast } from "@/components/ui/toast";
import type { Bodega, VistaInventario, VistaStockTotal } from "@/lib/types";
import { PageHeader } from "@/components/ui/page-header";
import { Input, Select } from "@/components/ui/field";
import { SEGMENTOS_MATERIAL } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { TableContainer, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { LoadingState, ErrorState, EmptyState } from "@/components/ui/states";

export default function InventarioPage() {
  const [busqueda, setBusqueda] = React.useState("");
  const [soloAlertas, setSoloAlertas] = React.useState(false);
  const [orden, setOrden] = React.useState<"az" | "za">("az");
  const [segmentoFiltro, setSegmentoFiltro] = React.useState<string>("Todos");
  const toast = useToast();

  async function exportar() {
    try {
      await exportarExcel(
        "inventario_insiso",
        filtrados.map((t) => {
          const fila: Record<string, string | number> = {
            sku: t.sku,
            material: t.material,
            unidad: t.unidad_medida,
          };
          // Una columna por bodega con la cantidad en esa bodega
          for (const b of bodegas) {
            fila[b.codigo] = matriz.get(`${t.material_id}|${b.id}`) ?? 0;
          }
          fila.stock_total = t.stock_total;
          fila.stock_minimo = t.stock_minimo;
          fila.valor_total = t.valor_total;
          fila.alerta_stock_bajo = t.alerta_stock_bajo ? "Sí" : "No";
          return fila;
        }),
        "Inventario"
      );
      toast.exito(`Exportados ${filtrados.length} ítem(s) a Excel.`);
    } catch (err) {
      toast.error(mensajeError(err));
    }
  }

  const { datos, cargando, error, refrescar } = useConsulta(async () => {
    const sb = getSupabaseClient();
    const [bodegas, inventario, totales, mats] = await Promise.all([
      sb.from("bodegas").select("*").eq("activo", true).order("codigo"),
      sb.from("vista_inventario").select("*"),
      sb.from("vista_stock_total").select("*").order("material"),
      sb.from("materiales").select("id, segmento"),
    ]);
    if (bodegas.error) throw bodegas.error;
    if (inventario.error) throw inventario.error;
    if (totales.error) throw totales.error;
    if (mats.error) throw mats.error;
    return {
      bodegas: bodegas.data as Bodega[],
      inventario: inventario.data as VistaInventario[],
      totales: totales.data as VistaStockTotal[],
      segmentos: (mats.data ?? []) as { id: string; segmento: string | null }[],
    };
  });

  const bodegas = datos?.bodegas ?? [];
  const inventario = datos?.inventario ?? [];
  const totales = datos?.totales ?? [];
  const segmentos = datos?.segmentos ?? [];

  const mapSegmento = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const x of segmentos) m.set(x.id, x.segmento ?? "");
    return m;
  }, [segmentos]);

  // Mapa material+bodega -> cantidad
  const matriz = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const r of inventario) m.set(`${r.material_id}|${r.bodega_id}`, r.cantidad);
    return m;
  }, [inventario]);

  const filtrados = totales
    .filter((t) => {
      const q = busqueda.toLowerCase().trim();
      const coincide = !q || t.sku.toLowerCase().includes(q) || t.material.toLowerCase().includes(q);
      const alerta = !soloAlertas || t.alerta_stock_bajo;
      const segOk = segmentoFiltro === "Todos" || (mapSegmento.get(t.material_id) ?? "") === segmentoFiltro;
      return coincide && alerta && segOk;
    })
    .sort((a, b) => {
      const cmp = a.material.localeCompare(b.material, "es", { sensitivity: "base" });
      return orden === "za" ? -cmp : cmp;
    });

  const valorTotal = totales.reduce((s, t) => s + Number(t.valor_total), 0);
  const alertas = totales.filter((t) => t.alerta_stock_bajo).length;

  return (
    <div>
      <PageHeader
        titulo="Inventario Multi-Bodega"
        descripcion="Matriz de niveles de stock por bodega con alertas de stock mínimo."
        icono={Boxes}
        acciones={
          <Button variante="outline" onClick={exportar} disabled={filtrados.length === 0}>
            <Download className="h-4 w-4" /> Exportar
          </Button>
        }
      />

      {/* KPIs */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiMini icono={Layers} etiqueta="SKUs en catálogo" valor={formatNumero(totales.length)} color="text-primary" />
        <KpiMini
          icono={CircleDollarSign}
          etiqueta="Valor del inventario"
          valor={formatCLP(valorTotal)}
          color="text-emerald-600"
        />
        <KpiMini
          icono={AlertTriangle}
          etiqueta="Alertas de stock bajo"
          valor={formatNumero(alertas)}
          color={alertas > 0 ? "text-amber-600" : "text-muted-foreground"}
        />
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative max-w-sm flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar material…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select
          value={segmentoFiltro}
          onChange={(e) => setSegmentoFiltro(e.target.value)}
          className="h-10 w-auto"
        >
          <option value="Todos">Todos los segmentos</option>
          {SEGMENTOS_MATERIAL.map((seg) => (
            <option key={seg} value={seg}>
              {seg}
            </option>
          ))}
        </Select>
        <Select value={orden} onChange={(e) => setOrden(e.target.value as "az" | "za")} className="h-10 w-auto">
          <option value="az">A → Z</option>
          <option value="za">Z → A</option>
        </Select>
        <Button
          variante={soloAlertas ? "primary" : "outline"}
          tamano="md"
          onClick={() => setSoloAlertas((v) => !v)}
        >
          <AlertTriangle className="h-4 w-4" />
          Solo alertas
        </Button>
      </div>

      {cargando ? (
        <LoadingState mensaje="Cargando inventario…" />
      ) : error ? (
        <ErrorState mensaje={error} onReintentar={refrescar} />
      ) : filtrados.length === 0 ? (
        <EmptyState
          titulo="Sin stock que mostrar"
          descripcion="No hay materiales que coincidan con el filtro actual."
        />
      ) : (
        <TableContainer>
          <THead>
            <TR>
              <TH className="sticky left-0 bg-muted/50">Material</TH>
              {bodegas.map((b) => (
                <TH key={b.id} className="text-right">
                  {b.codigo}
                </TH>
              ))}
              <TH className="text-right">Stock Total</TH>
              <TH className="text-right">Valorizado</TH>
              <TH className="text-center">Estado</TH>
            </TR>
          </THead>
          <TBody>
            {filtrados.map((t) => (
              <TR key={t.material_id}>
                <TD className="sticky left-0 bg-card">
                  <p className="font-medium leading-tight">{t.material}</p>
                  <p className="font-mono text-[11px] text-muted-foreground">
                    {t.sku} · {t.unidad_medida}
                  </p>
                </TD>
                {bodegas.map((b) => {
                  const cant = matriz.get(`${t.material_id}|${b.id}`) ?? 0;
                  return (
                    <TD key={b.id} className="text-right tabular-nums">
                      {cant > 0 ? (
                        formatNumero(cant, 0)
                      ) : (
                        <span className="text-muted-foreground/40">0</span>
                      )}
                    </TD>
                  );
                })}
                <TD className="text-right font-semibold tabular-nums">
                  {formatNumero(t.stock_total, 0)}
                </TD>
                <TD className="text-right tabular-nums text-muted-foreground">
                  {formatCLP(t.valor_total)}
                </TD>
                <TD className="text-center">
                  {t.alerta_stock_bajo ? (
                    <Badge color="bg-amber-100 text-amber-700 ring-amber-200">
                      <AlertTriangle className="mr-1 h-3 w-3" /> Bajo (mín {formatNumero(t.stock_minimo, 0)})
                    </Badge>
                  ) : (
                    <Badge color="bg-emerald-100 text-emerald-700 ring-emerald-200">OK</Badge>
                  )}
                </TD>
              </TR>
            ))}
          </TBody>
        </TableContainer>
      )}

      {!cargando && !error && bodegas.length === 0 && (
        <p className="mt-3 text-sm text-muted-foreground">
          No hay bodegas activas. Crea bodegas y registra movimientos para ver stock.
        </p>
      )}
    </div>
  );
}

function KpiMini({
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
      <CardContent className="flex items-center gap-4 p-5">
        <div className={cn("flex h-11 w-11 items-center justify-center rounded-xl bg-muted", color)}>
          <Icono className="h-6 w-6" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{etiqueta}</p>
          <p className="text-xl font-bold tracking-tight">{valor}</p>
        </div>
      </CardContent>
    </Card>
  );
}
