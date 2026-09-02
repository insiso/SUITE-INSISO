"use client";

import * as React from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

type TipoToast = "exito" | "error" | "info";

interface Toast {
  id: number;
  tipo: TipoToast;
  mensaje: string;
}

interface ToastContextValue {
  toast: (mensaje: string, tipo?: TipoToast) => void;
  exito: (mensaje: string) => void;
  error: (mensaje: string) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error("useToast debe usarse dentro de <ToastProvider>");
  return ctx;
}

const estilos: Record<TipoToast, { icon: React.ComponentType<{ className?: string }>; clase: string }> = {
  exito: { icon: CheckCircle2, clase: "border-emerald-200 bg-emerald-50 text-emerald-800" },
  error: { icon: AlertCircle, clase: "border-rose-200 bg-rose-50 text-rose-800" },
  info: { icon: Info, clase: "border-blue-200 bg-blue-50 text-blue-800" },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);

  const remove = React.useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = React.useCallback(
    (mensaje: string, tipo: TipoToast = "info") => {
      const id = Date.now() + Math.random();
      setToasts((prev) => [...prev, { id, tipo, mensaje }]);
      setTimeout(() => remove(id), 4500);
    },
    [remove]
  );

  const value = React.useMemo<ToastContextValue>(
    () => ({
      toast,
      exito: (m: string) => toast(m, "exito"),
      error: (m: string) => toast(m, "error"),
    }),
    [toast]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-full max-w-sm flex-col gap-2">
        {toasts.map((t) => {
          const { icon: Icon, clase } = estilos[t.tipo];
          return (
            <div
              key={t.id}
              className={cn(
                "pointer-events-auto flex items-start gap-3 rounded-xl border px-4 py-3 shadow-lg",
                clase
              )}
            >
              <Icon className="mt-0.5 h-5 w-5 shrink-0" />
              <p className="flex-1 text-sm font-medium">{t.mensaje}</p>
              <button onClick={() => remove(t.id)} aria-label="Cerrar" className="opacity-60 hover:opacity-100">
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
