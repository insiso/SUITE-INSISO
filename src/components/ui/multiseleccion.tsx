"use client";

import * as React from "react";
import { CheckSquare, Trash2, X, EyeOff } from "lucide-react";
import { Button } from "./button";

/** Estado y helpers para seleccionar varias filas y eliminarlas en bloque. */
export function useMultiSeleccion() {
  const [modo, setModo] = React.useState(false);
  const [sel, setSel] = React.useState<Set<string>>(new Set());

  const toggle = React.useCallback((id: string) => {
    setSel((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }, []);

  const seleccionarTodos = React.useCallback((ids: string[]) => {
    setSel((prev) => {
      const todos = ids.length > 0 && ids.every((i) => prev.has(i));
      return todos ? new Set() : new Set(ids);
    });
  }, []);

  const salir = React.useCallback(() => {
    setModo(false);
    setSel(new Set());
  }, []);

  return { modo, setModo, sel, toggle, seleccionarTodos, salir };
}

/** Botón para entrar/salir del modo selección (va en las acciones de la página). */
export function BotonSeleccionar({ modo, onClick }: { modo: boolean; onClick: () => void }) {
  return (
    <Button variante="outline" onClick={onClick}>
      {modo ? <X className="h-4 w-4" /> : <CheckSquare className="h-4 w-4" />}
      {modo ? "Cancelar selección" : "Seleccionar"}
    </Button>
  );
}

/** Barra que aparece en modo selección: seleccionar todo + eliminar. */
export function BarraSeleccion({
  total,
  cantidad,
  todosMarcados,
  onTodos,
  onEliminar,
  onDesactivar,
}: {
  total: number;
  cantidad: number;
  todosMarcados: boolean;
  onTodos: () => void;
  onEliminar?: () => void;
  onDesactivar?: () => void;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
      <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          checked={todosMarcados}
          onChange={onTodos}
          className="h-4 w-4 rounded border-input"
        />
        Seleccionar todo ({total})
      </label>
      <span className="text-sm text-muted-foreground">{cantidad} seleccionado(s)</span>
      <div className="ml-auto flex flex-wrap gap-2">
        {onDesactivar && (
          <Button variante="outline" tamano="sm" disabled={cantidad === 0} onClick={onDesactivar}>
            <EyeOff className="h-4 w-4" /> Desactivar seleccionados
          </Button>
        )}
        {onEliminar && (
          <Button variante="destructive" tamano="sm" disabled={cantidad === 0} onClick={onEliminar}>
            <Trash2 className="h-4 w-4" /> Eliminar seleccionados
          </Button>
        )}
      </div>
    </div>
  );
}

/** Casilla para una fila/tarjeta. */
export function CasillaFila({
  marcado,
  onChange,
}: {
  marcado: boolean;
  onChange: () => void;
}) {
  return (
    <input
      type="checkbox"
      checked={marcado}
      onChange={onChange}
      onClick={(e) => e.stopPropagation()}
      className="h-4 w-4 rounded border-input"
      aria-label="Seleccionar"
    />
  );
}
