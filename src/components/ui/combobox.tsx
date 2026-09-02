"use client";

import * as React from "react";
import { Input } from "./field";
import { cn } from "@/lib/utils";

export type ComboItem = { id: string; label: string; buscar?: string };

/**
 * Buscador con autocompletar (combobox de selección única).
 * Escribe para filtrar por texto; navega con ↑ ↓ y elige con Enter o clic.
 */
export function Combobox({
  items,
  value,
  onChange,
  placeholder,
  sinResultados = "Sin coincidencias",
  maxVisibles = 50,
  vacioLabel,
}: {
  items: ComboItem[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  sinResultados?: string;
  maxVisibles?: number;
  vacioLabel?: string;
}) {
  const [abierto, setAbierto] = React.useState(false);
  const [texto, setTexto] = React.useState("");
  const [idx, setIdx] = React.useState(0);
  const ref = React.useRef<HTMLDivElement>(null);

  const seleccionado = items.find((i) => i.id === value) ?? null;

  React.useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const q = texto.trim().toLowerCase();
  const filtrados = React.useMemo(() => {
    const base = !q
      ? items
      : items.filter((i) => (i.buscar ?? i.label).toLowerCase().includes(q));
    return base.slice(0, maxVisibles);
  }, [items, q, maxVisibles]);

  const mostrado = abierto ? texto : seleccionado?.label ?? "";

  function elegir(item: ComboItem) {
    onChange(item.id);
    setTexto("");
    setAbierto(false);
  }

  return (
    <div className="relative" ref={ref}>
      <Input
        value={mostrado}
        placeholder={placeholder}
        onChange={(e) => {
          setTexto(e.target.value);
          setAbierto(true);
          setIdx(0);
        }}
        onFocus={() => {
          setTexto("");
          setAbierto(true);
          setIdx(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setAbierto(true);
            setIdx((i) => Math.min(i + 1, filtrados.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setIdx((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter") {
            if (abierto && filtrados[idx]) {
              e.preventDefault();
              elegir(filtrados[idx]);
            }
          } else if (e.key === "Escape") {
            setAbierto(false);
          }
        }}
        autoComplete="off"
      />
      {abierto && (
        <div className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-input bg-card shadow-lg">
          {vacioLabel && !q && (
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                onChange("");
                setTexto("");
                setAbierto(false);
              }}
              className="block w-full truncate px-3 py-2 text-left text-sm text-muted-foreground hover:bg-muted"
            >
              {vacioLabel}
            </button>
          )}
          {filtrados.length === 0 ? (
            <p className="px-3 py-2 text-sm text-muted-foreground">{sinResultados}</p>
          ) : (
            filtrados.map((item, i) => (
              <button
                type="button"
                key={item.id}
                onMouseDown={(e) => {
                  e.preventDefault();
                  elegir(item);
                }}
                onMouseEnter={() => setIdx(i)}
                className={cn(
                  "block w-full truncate px-3 py-2 text-left text-sm",
                  i === idx ? "bg-primary/10 text-primary" : "hover:bg-muted",
                  item.id === value && "font-semibold"
                )}
              >
                {item.label}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
