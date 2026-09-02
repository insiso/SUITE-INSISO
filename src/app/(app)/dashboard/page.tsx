"use client";

import * as React from "react";
import Link from "next/link";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  LayoutDashboard,
  Wallet,
  Receipt,
  PiggyBank,
  FolderKanban,
  AlertTriangle,
  Undo2,
  ArrowRight,
} from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useConsulta } from "@/lib/hooks";
import { formatCLP, formatPorcentaje, formatNumero, cn } from "@/lib/utils";
import type {
  VistaResumenProyecto,
  VistaStockTotal,
  Gasto,
  CategoriaPresupuesto,
} from "@/lib/types";
import { COLOR_ESTADO_PROYECTO } from "@/lib/constants";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoadingState, ErrorState } from "@/components/ui/states";
import {
  GastoMensualChart,
  ConsumoMaterialesChart,
  EjecucionProyectosChart,
  DistribucionCategoriaChart,
} from "@/components/dashboard/charts";

type Salida = {
  fecha: string;
  cantidad: number;
  costo_unitario: number;
  material_id: string;
};

export default function DashboardPage() {
  const { datos, cargando, error, refrescar } = useConsulta(async () => {
    const sb = getSupabaseClient();
    const [resumen, stock, gastos, salidas, materiales, prestamos] = await Promise.all([
      sb.from("vista_resumen_proyectos").select("*"),
      sb.from("vista_stock_total").select("*"),
      sb.from("gastos").select("categoria, monto, fecha"),
      sb
        .from("movimientos_kardex")
        .select("fecha, cantidad, costo_unitario, material_id")
        .eq("tipo", "SALIDA"),
      sb.from("materiales").select("id, descripcion"),
      sb
        .from("prestamos_herramientas")
        .select("id", { count: "exact", head: true })
        .eq("estado", "PRESTADA"),
    ]);
    if (resumen.error) throw resumen.error;
    if (stock.error) throw stock.error;
    if (gastos.error) throw gastos.error;
    if (salidas.error) throw salidas.error;
    if (materiales.error) throw materiales.error;
    if (prestamos.error) throw prestamos.error;
    return {
      resumen: resumen.data as VistaResumenProyecto[],
      stock: stock.data as VistaStockTotal[],
      gastos: gastos.data as Pick<Gasto, "categoria" | "monto" | "fecha">[],
      salidas: salidas.data as Salida[],
      materiales: materiales.data as { id: string; descripcion: string }[],
      devolucionesPendientes: prestamos.count ?? 0,
    };
  });

  const resumen = datos?.resumen ?? [];
  const stock = datos?.stock ?? [];
  const gastos = datos?.gastos ?? [];
  const salidas = datos?.salidas ?? [];
  const materiales = datos?.materiales ?? [];

  const mapMaterial = React.useMemo(
    () => new Map(materiales.map((m) => [m.id, m.descripcion])),
    [materiales]
  );

  // ---- KPIs ----
  const presupuestoTotal = resumen.reduce((s, r) => s + Number(r.presupuesto_total), 0);
  const gastoTotal = resumen.reduce((s, r) => s + Number(r.gasto_real), 0);
  const saldoTotal = presupuestoTotal - gastoTotal;
  const ejecucionGlobal = presupuestoTotal > 0 ? (gastoTotal / presupuestoTotal) * 100 : 0;
  const proyectosActivos = resumen.filter((r) => r.estado === "Activo").length;
  const alertasStock = stock.filter((s) => s.alerta_stock_bajo);
  const devolucionesPendientes = datos?.devolucionesPendientes ?? 0;

  // ---- Gasto mensual (últimos 6 meses) ----
  const gastoMensual = React.useMemo(() => {
    const hoy = new Date();
    const buckets: { key: string; mes: string; gasto: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      buckets.push({ key, mes: format(d, "MMM", { locale: es }), gasto: 0 });
    }
    const idx = new Map(buckets.map((b, i) => [b.key, i]));
    const add = (fecha: string, monto: number) => {
      const k = fecha.slice(0, 7);
      const i = idx.get(k);
      if (i !== undefined) buckets[i].gasto += monto;
    };
    gastos.forEach((g) => add(g.fecha, Number(g.monto)));
    salidas.forEach((s) => add(s.fecha, Number(s.cantidad) * Number(s.costo_unitario)));
    return buckets.map(({ mes, gasto }) => ({ mes, gasto }));
  }, [gastos, salidas]);

  // ---- Consumo de materiales (top 6 por valor) ----
  const consumoMateriales = React.useMemo(() => {
    const acc = new Map<string, number>();
    salidas.forEach((s) => {
      const v = Number(s.cantidad) * Number(s.costo_unitario);
      acc.set(s.material_id, (acc.get(s.material_id) ?? 0) + v);
    });
    return Array.from(acc.entries())
      .map(([id, valor]) => ({ nombre: mapMaterial.get(id) ?? "—", valor }))
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 6);
  }, [salidas, mapMaterial]);

  // ---- Ejecución por proyecto ----
  const ejecucionProyectos = resumen
    .slice(0, 6)
    .map((r) => ({ codigo: r.codigo, asignado: Number(r.presupuesto_total), gastado: Number(r.gasto_real) }));

  // ---- Distribución de gasto por categoría ----
  const distribucionCategoria = React.useMemo(() => {
    const acc = new Map<CategoriaPresupuesto, number>();
    gastos.forEach((g) => acc.set(g.categoria, (acc.get(g.categoria) ?? 0) + Number(g.monto)));
    const materialesConsumo = salidas.reduce((s, x) => s + Number(x.cantidad) * Number(x.costo_unitario), 0);
    if (materialesConsumo > 0) acc.set("Materiales", (acc.get("Materiales") ?? 0) + materialesConsumo);
    return Array.from(acc.entries())
      .map(([categoria, monto]) => ({ categoria, monto }))
      .filter((x) => x.monto > 0);
  }, [gastos, salidas]);

  if (cargando) return <LoadingState mensaje="Cargando indicadores…" />;
  if (error) return <ErrorState mensaje={error} onReintentar={refrescar} />;

  return (
    <div>
      <PageHeader
        titulo="Dashboard"
        descripcion="Control de gestión: presupuesto, inventario, proyectos y herramientas."
        icono={LayoutDashboard}
      />

      {/* KPIs principales */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icono={Wallet}
          etiqueta="Presupuesto total"
          valor={formatCLP(presupuestoTotal)}
          color="bg-primary/10 text-primary"
        />
        <KpiCard
          icono={Receipt}
          etiqueta="Gasto real comprometido"
          valor={formatCLP(gastoTotal)}
          color="bg-rose-100 text-rose-600"
          subtitulo={`Ejecución global ${formatPorcentaje(ejecucionGlobal)}`}
        />
        <KpiCard
          icono={PiggyBank}
          etiqueta="Saldo disponible"
          valor={formatCLP(saldoTotal)}
          color={saldoTotal < 0 ? "bg-rose-100 text-rose-600" : "bg-emerald-100 text-emerald-600"}
        />
        <KpiCard
          icono={FolderKanban}
          etiqueta="Proyectos activos"
          valor={formatNumero(proyectosActivos)}
          color="bg-blue-100 text-blue-600"
          subtitulo={`${resumen.length} en total`}
        />
      </div>

      {/* Alertas secundarias */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <AlertaCard
          icono={AlertTriangle}
          titulo="Alertas de stock bajo"
          cantidad={alertasStock.length}
          descripcion="Materiales en o bajo su stock mínimo"
          href="/inventario"
          tono={alertasStock.length > 0 ? "warning" : "ok"}
        />
        <AlertaCard
          icono={Undo2}
          titulo="Devoluciones pendientes"
          cantidad={devolucionesPendientes}
          descripcion="Herramientas actualmente prestadas"
          href="/herramientas"
          tono={devolucionesPendientes > 0 ? "info" : "ok"}
        />
      </div>

      {/* Gráficos */}
      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Gasto Mensual (últimos 6 meses)</CardTitle>
          </CardHeader>
          <CardContent>
            <GastoMensualChart data={gastoMensual} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Gasto por Categoría</CardTitle>
          </CardHeader>
          <CardContent>
            <DistribucionCategoriaChart data={distribucionCategoria} />
          </CardContent>
        </Card>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Consumo de Materiales (Top 6)</CardTitle>
          </CardHeader>
          <CardContent>
            <ConsumoMaterialesChart data={consumoMateriales} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Presupuesto vs. Gasto Real por Proyecto</CardTitle>
          </CardHeader>
          <CardContent>
            <EjecucionProyectosChart data={ejecucionProyectos} />
          </CardContent>
        </Card>
      </div>

      {/* Tabla resumen de proyectos */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Estado de Proyectos</CardTitle>
          <Link
            href="/proyectos"
            className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            Ver todos <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </CardHeader>
        <CardContent>
          {resumen.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No hay proyectos registrados.</p>
          ) : (
            <div className="overflow-x-auto scrollbar-thin">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 text-left font-semibold">Proyecto</th>
                    <th className="py-2 text-left font-semibold">Estado</th>
                    <th className="py-2 text-right font-semibold">Presupuesto</th>
                    <th className="py-2 text-right font-semibold">Gasto real</th>
                    <th className="py-2 pl-6 text-left font-semibold">Ejecución</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {resumen.map((r) => {
                    const sobregiro = r.porcentaje_ejecucion > 100;
                    return (
                      <tr key={r.id} className="transition-colors hover:bg-muted/40">
                        <td className="py-3">
                          <Link href={`/proyectos/${r.id}`} className="group">
                            <p className="font-medium leading-tight group-hover:text-primary group-hover:underline">
                              {r.nombre}
                            </p>
                            <p className="font-mono text-[11px] text-muted-foreground">{r.codigo}</p>
                          </Link>
                        </td>
                        <td className="py-3">
                          <Badge color={COLOR_ESTADO_PROYECTO[r.estado]}>{r.estado}</Badge>
                        </td>
                        <td className="py-3 text-right tabular-nums">{formatCLP(r.presupuesto_total)}</td>
                        <td className="py-3 text-right tabular-nums">{formatCLP(r.gasto_real)}</td>
                        <td className="py-3 pl-6">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                              <div
                                className={cn(
                                  "h-full rounded-full",
                                  sobregiro ? "bg-destructive" : r.porcentaje_ejecucion > 85 ? "bg-amber-500" : "bg-primary"
                                )}
                                style={{ width: `${Math.min(r.porcentaje_ejecucion, 100)}%` }}
                              />
                            </div>
                            <span className={cn("text-xs font-medium", sobregiro && "text-destructive")}>
                              {formatPorcentaje(r.porcentaje_ejecucion)}
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Lista de alertas de stock */}
      {alertasStock.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-700">
              <AlertTriangle className="h-4 w-4" /> Materiales con Stock Bajo
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border">
              {alertasStock.slice(0, 8).map((s) => (
                <li key={s.material_id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <div>
                    <p className="font-medium">{s.material}</p>
                    <p className="font-mono text-[11px] text-muted-foreground">{s.sku}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-amber-700">
                      {formatNumero(s.stock_total, 0)} {s.unidad_medida}
                    </p>
                    <p className="text-[11px] text-muted-foreground">mín. {formatNumero(s.stock_minimo, 0)}</p>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function KpiCard({
  icono: Icono,
  etiqueta,
  valor,
  color,
  subtitulo,
}: {
  icono: React.ComponentType<{ className?: string }>;
  etiqueta: string;
  valor: string;
  color: string;
  subtitulo?: string;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground">{etiqueta}</p>
            <p className="mt-1 truncate text-2xl font-bold tracking-tight">{valor}</p>
            {subtitulo && <p className="mt-1 text-xs text-muted-foreground">{subtitulo}</p>}
          </div>
          <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl", color)}>
            <Icono className="h-6 w-6" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function AlertaCard({
  icono: Icono,
  titulo,
  cantidad,
  descripcion,
  href,
  tono,
}: {
  icono: React.ComponentType<{ className?: string }>;
  titulo: string;
  cantidad: number;
  descripcion: string;
  href: string;
  tono: "warning" | "info" | "ok";
}) {
  const colores = {
    warning: "bg-amber-50 text-amber-700 ring-amber-200",
    info: "bg-blue-50 text-blue-700 ring-blue-200",
    ok: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  }[tono];
  return (
    <Link href={href}>
      <Card className="transition-shadow hover:shadow-md">
        <CardContent className="flex items-center gap-4 p-5">
          <div className={cn("flex h-12 w-12 items-center justify-center rounded-xl ring-1 ring-inset", colores)}>
            <Icono className="h-6 w-6" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold">{titulo}</p>
            <p className="text-xs text-muted-foreground">{descripcion}</p>
          </div>
          <span className="text-3xl font-bold tabular-nums">{cantidad}</span>
        </CardContent>
      </Card>
    </Link>
  );
}
