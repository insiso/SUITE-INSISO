"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { Menu, UserCircle2, LogOut, ChevronDown } from "lucide-react";
import { NAVEGACION } from "./nav-config";
import { getSupabaseClient, supabaseConfigurado } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

function tituloActual(pathname: string): string {
  for (const grupo of NAVEGACION) {
    for (const item of grupo.items) {
      if (pathname === item.href || pathname.startsWith(item.href + "/")) {
        return item.etiqueta;
      }
    }
  }
  return "Inicio";
}

export function Topbar({ onMenu }: { onMenu: () => void }) {
  const pathname = usePathname();
  const titulo = tituloActual(pathname);

  const [nombre, setNombre] = React.useState<string>("");
  const [email, setEmail] = React.useState<string>("");
  const [rol, setRol] = React.useState<string>("");
  const [menuAbierto, setMenuAbierto] = React.useState(false);
  const [saliendo, setSaliendo] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    let activo = true;
    (async () => {
      try {
        const sb = getSupabaseClient();
        const {
          data: { user },
        } = await sb.auth.getUser();
        if (!user || !activo) return;
        setEmail(user.email ?? "");
        const { data: perfil } = await sb
          .from("usuarios")
          .select("nombre, rol")
          .eq("auth_user_id", user.id)
          .single();
        if (activo && perfil) {
          setNombre((perfil as { nombre: string }).nombre);
          setRol((perfil as { rol: string }).rol);
        }
      } catch {
        /* sin sesión o sin credenciales */
      }
    })();
    return () => {
      activo = false;
    };
  }, []);

  React.useEffect(() => {
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuAbierto(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  async function cerrarSesion() {
    setSaliendo(true);
    try {
      const sb = getSupabaseClient();
      await sb.auth.signOut();
    } catch {
      /* noop */
    }
    window.location.href = "/login";
  }

  const iniciales = (nombre || email || "U")
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-card/80 px-4 backdrop-blur-md sm:px-6">
      <button
        onClick={onMenu}
        className="rounded-lg p-2 text-muted-foreground hover:bg-accent lg:hidden"
        aria-label="Abrir menú"
      >
        <Menu className="h-5 w-5" />
      </button>

      <div className="flex flex-col leading-tight">
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
          Control de Gestión
        </span>
        <h2 className="text-sm font-semibold text-foreground">{titulo}</h2>
      </div>

      <div className="ml-auto flex items-center gap-3">
        <div
          className={cn(
            "hidden items-center gap-2 rounded-full px-3 py-1 text-xs font-medium sm:flex",
            supabaseConfigurado ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
          )}
          title={supabaseConfigurado ? "Conectado a Supabase" : "Sin credenciales de Supabase"}
        >
          <span className={cn("h-2 w-2 rounded-full", supabaseConfigurado ? "bg-emerald-500" : "bg-amber-500")} />
          {supabaseConfigurado ? "Base conectada" : "Configurar BD"}
        </div>

        {/* Menú de usuario */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuAbierto((v) => !v)}
            className="flex items-center gap-2 rounded-full border border-border bg-card py-1 pl-1 pr-2 transition-colors hover:bg-accent"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
              {iniciales}
            </span>
            <div className="hidden leading-tight sm:block">
              <p className="text-xs font-semibold text-foreground">{nombre || "Usuario"}</p>
              <p className="text-[10px] text-muted-foreground">{rol || "—"}</p>
            </div>
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </button>

          {menuAbierto && (
            <div className="absolute right-0 mt-2 w-56 overflow-hidden rounded-xl border border-border bg-card shadow-lg">
              <div className="flex items-center gap-3 border-b border-border p-3">
                <UserCircle2 className="h-9 w-9 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{nombre || "Usuario"}</p>
                  <p className="truncate text-xs text-muted-foreground">{email}</p>
                </div>
              </div>
              <button
                onClick={cerrarSesion}
                disabled={saliendo}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
              >
                <LogOut className="h-4 w-4" />
                {saliendo ? "Cerrando sesión…" : "Cerrar sesión"}
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
