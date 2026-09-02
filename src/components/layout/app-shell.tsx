"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import type { RolUsuario } from "@/lib/types";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";

export function AppShell({
  children,
  rol,
  tieneBodega = false,
}: {
  children: React.ReactNode;
  rol: RolUsuario | null;
  tieneBodega?: boolean;
}) {
  const [mobileOpen, setMobileOpen] = React.useState(false);

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar fijo (escritorio) */}
      <div className="fixed inset-y-0 left-0 z-40 hidden lg:block">
        <Sidebar rol={rol} tieneBodega={tieneBodega} />
      </div>

      {/* Drawer móvil */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
            aria-hidden
          />
          <div className="absolute inset-y-0 left-0 shadow-2xl">
            <Sidebar rol={rol} tieneBodega={tieneBodega} onNavegar={() => setMobileOpen(false)} />
          </div>
        </div>
      )}

      {/* Contenido principal */}
      <div className={cn("flex min-w-0 flex-1 flex-col lg:pl-64")}>
        <Topbar onMenu={() => setMobileOpen(true)} />
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
