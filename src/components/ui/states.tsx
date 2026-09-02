import * as React from "react";
import { AlertTriangle, Inbox, Loader2, DatabaseZap } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

/** Skeleton genérico. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton rounded-md", className)} />;
}

/** Skeleton de tabla mientras cargan los datos. */
export function TableSkeleton({ filas = 5, columnas = 5 }: { filas?: number; columnas?: number }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <Skeleton className="mb-4 h-6 w-1/3" />
      <div className="space-y-3">
        {Array.from({ length: filas }).map((_, i) => (
          <div key={i} className="flex gap-4">
            {Array.from({ length: columnas }).map((_, j) => (
              <Skeleton key={j} className="h-5 flex-1" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Estado de carga centrado. */
export function LoadingState({ mensaje = "Cargando…" }: { mensaje?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
      <Loader2 className="h-7 w-7 animate-spin text-primary" />
      <p className="text-sm">{mensaje}</p>
    </div>
  );
}

/** Estado de error con opción de reintento. */
export function ErrorState({
  mensaje,
  onReintentar,
}: {
  mensaje: string;
  onReintentar?: () => void;
}) {
  const esConfig = /credenciales|Supabase/i.test(mensaje);
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 py-12 px-6 text-center">
      {esConfig ? (
        <DatabaseZap className="h-8 w-8 text-destructive" />
      ) : (
        <AlertTriangle className="h-8 w-8 text-destructive" />
      )}
      <div>
        <p className="font-medium text-destructive">No se pudieron cargar los datos</p>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">{mensaje}</p>
      </div>
      {onReintentar && (
        <Button variante="outline" tamano="sm" onClick={onReintentar}>
          Reintentar
        </Button>
      )}
    </div>
  );
}

/** Estado vacío. */
export function EmptyState({
  titulo,
  descripcion,
  accion,
}: {
  titulo: string;
  descripcion?: string;
  accion?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card/50 py-16 px-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <Inbox className="h-6 w-6 text-muted-foreground" />
      </div>
      <div>
        <p className="font-medium text-foreground">{titulo}</p>
        {descripcion && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{descripcion}</p>}
      </div>
      {accion}
    </div>
  );
}
