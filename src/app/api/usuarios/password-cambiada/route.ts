import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin, serviceRoleConfigurado } from "@/lib/supabase/admin";

// Marca que el usuario actual ya definio su contrasena (limpia debe_cambiar_password).
export async function POST() {
  const supabase = getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  if (serviceRoleConfigurado) {
    const admin = getSupabaseAdmin();
    await admin
      .from("usuarios")
      .update({ debe_cambiar_password: false })
      .eq("auth_user_id", user.id);
  }
  return NextResponse.json({ ok: true });
}
