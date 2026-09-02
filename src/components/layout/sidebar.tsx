"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { APP_EMPRESA } from "@/lib/constants";
import type { RolUsuario } from "@/lib/types";
import { puedeAcceder } from "@/lib/permisos";
import { NAVEGACION } from "./nav-config";

export function Sidebar({
  rol,
  tieneBodega = false,
  onNavegar,
}: {
  rol: RolUsuario | null;
  tieneBodega?: boolean;
  onNavegar?: () => void;
}) {
  const pathname = usePathname();

  // Mostrar solo los grupos/ítems permitidos para el rol
  const navegacion = NAVEGACION.map((grupo) => ({
    ...grupo,
    items: grupo.items.filter((item) => puedeAcceder(rol, item.href, tieneBodega)),
  })).filter((grupo) => grupo.items.length > 0);

  return (
    <aside className="flex h-full w-64 flex-col bg-sidebar text-sidebar-foreground">
      {/* Marca */}
      <div className="flex h-16 items-center justify-between gap-2 border-b border-sidebar-border px-5">
        <Link href="/dashboard" className="flex items-center gap-2.5" onClick={onNavegar}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo-insiso-blanco.png"
            alt="INSISO · Ingeniería, Sistemas & Software"
            className="h-8 w-auto"
          />
        </Link>
        {onNavegar && (
          <button
            onClick={onNavegar}
            className="rounded-md p-1 text-sidebar-foreground/70 hover:bg-white/10 lg:hidden"
            aria-label="Cerrar menú"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Navegación */}
      <nav className="flex-1 space-y-6 overflow-y-auto scrollbar-thin px-3 py-5">
        {navegacion.map((grupo) => (
          <div key={grupo.titulo}>
            <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/45">
              {grupo.titulo}
            </p>
            <ul className="space-y-1">
              {grupo.items.map((item) => {
                const activo =
                  pathname === item.href || pathname.startsWith(item.href + "/");
                const Icono = item.icono;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavegar}
                      className={cn(
                        "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                        activo
                          ? "bg-sidebar-accent text-white shadow-sm"
                          : "text-sidebar-foreground/75 hover:bg-white/10 hover:text-white"
                      )}
                    >
                      <Icono className="h-[18px] w-[18px] shrink-0" />
                      <span>{item.etiqueta}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Pie */}
      <div className="border-t border-sidebar-border px-5 py-4">
        <p className="text-[11px] leading-tight text-sidebar-foreground/50">{APP_EMPRESA}</p>
        <p className="mt-0.5 text-[11px] text-sidebar-foreground/35">v1.0 · Supabase</p>
      </div>
    </aside>
  );
}
