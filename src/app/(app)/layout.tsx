import { redirect } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/app-shell";
import type { RolUsuario } from "@/lib/types";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Doble proteccion (ademas del middleware): sin sesion, fuera.
  if (!user) {
    redirect("/login");
  }

  const { data: perfil } = await supabase
    .from("usuarios")
    .select("rol, debe_cambiar_password, bodega_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  // Primer ingreso: obligar a definir una contrasena propia antes de usar el sistema.
  if (perfil?.debe_cambiar_password) {
    redirect("/actualizar-password?forzado=1");
  }

  const rol = (perfil?.rol ?? null) as RolUsuario | null;
  const tieneBodega = !!(perfil as { bodega_id?: string | null } | null)?.bodega_id;

  return (
    <AppShell rol={rol} tieneBodega={tieneBodega}>
      {children}
    </AppShell>
  );
}
