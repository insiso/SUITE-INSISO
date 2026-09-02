"use client";

import * as React from "react";
import { TrendingDown, Search, Award, Loader2 } from "lucide-react";
import { mensajeError, formatCLP, formatFecha, cn } from "@/lib/utils";
import type { ComparadorPrecio } from "@/lib/types";
import { PageHeader } from "@/components/ui/page-header";
import { Input } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { TableContainer, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";

export default function AbastecimientoPage() {
  const toast = useToast();
  const [q, setQ] = React.useState("");
  const [buscando, setBuscando] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [resultados, setResultados] = React.useState<ComparadorPrecio[] | null>(null);

  async function buscar(e: React.FormEvent) {
    e.preventDefault();
    const termino = q.trim();
    if (termino.length < 2) {
      toast.error("Ingresa al menos 2 caracteres.");
      return;
    }
    setBuscando(true);
    setError(null);
    try {
      const res = await fetch(`/api/abastecimiento/comparar-precios?q=${encodeURIComponent(termino)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error en la búsqueda.");
      setResultados(json.resultados as ComparadorPrecio[]);
    } catch (err) {
      setError(mensajeError(err));
      setResultados(null);
    } finally {
      setBuscando(false);
    }
  }

  return (
    <div>
      <PageHeader
        titulo="Comparador de Precios"
        descripcion="¿Quién vende más barato? Historial de precios por ítem entre tus proveedores."
        icono={TrendingDown}
      />

      <Card className="mb-6">
        <CardContent className="p-5">
          <form onSubmit={buscar} className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Ej: cemento, fierro, gravilla…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button type="submit" cargando={buscando} tamano="md">
              {!buscando && <Search className="h-4 w-4" />}
              Comparar precios
            </Button>
          </form>
        </CardContent>
      </Card>

      {buscando ? (
        <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin text-primary" /> Buscando precios…
        </div>
      ) : error ? (
        <ErrorState mensaje={error} />
      ) : resultados === null ? (
        <EmptyState
          titulo="Busca un producto"
          descripcion="Escribe el nombre de un ítem para ver qué proveedores lo han vendido y a qué precio."
        />
      ) : resultados.length === 0 ? (
        <EmptyState
          titulo="Sin historial para ese ítem"
          descripcion="No hay facturas registradas con ese producto todavía."
        />
      ) : (
        <TableContainer>
          <THead>
            <TR>
              <TH className="w-10 text-center">#</TH>
              <TH>Proveedor</TH>
              <TH>Producto</TH>
              <TH className="text-right">Mejor precio</TH>
              <TH>Última compra</TH>
              <TH>Folio ref.</TH>
            </TR>
          </THead>
          <TBody>
            {resultados.map((r, i) => (
              <TR key={`${r.proveedor_id}-${r.producto}`} className={cn(i === 0 && "bg-emerald-50/60")}>
                <TD className="text-center">
                  {i === 0 ? (
                    <Award className="mx-auto h-4 w-4 text-emerald-600" />
                  ) : (
                    <span className="text-xs text-muted-foreground">{i + 1}</span>
                  )}
                </TD>
                <TD className="font-medium">
                  {r.razon_social}
                  {i === 0 && (
                    <Badge color="ml-2 bg-emerald-100 text-emerald-700 ring-emerald-200">Mejor opción</Badge>
                  )}
                </TD>
                <TD className="text-muted-foreground">{r.producto}</TD>
                <TD className="text-right font-semibold tabular-nums">{formatCLP(r.mejor_precio)}</TD>
                <TD className="text-xs">{formatFecha(r.ultima_compra)}</TD>
                <TD className="font-mono text-xs text-muted-foreground">{r.numero_factura}</TD>
              </TR>
            ))}
          </TBody>
        </TableContainer>
      )}
    </div>
  );
}
