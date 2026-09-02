import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin, serviceRoleConfigurado } from "@/lib/supabase/admin";
import type { RolUsuario } from "@/lib/types";

const ROLES_VALIDOS: RolUsuario[] = [
  "Administrador",
  "Jefe de Proyecto",
  "Bodeguero",
  "Adquisiciones",
  "Visualizador",
];

/** Verifica que quien llama esté autenticado y sea Administrador. */
async function exigirAdministrador() {
  const supabase = getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado.", status: 401 as const };

  const { data: perfil } = await supabase
    .from("usuarios")
    .select("rol")
    .eq("auth_user_id", user.id)
    .single();

  if (!perfil || perfil.rol !== "Administrador") {
    return { error: "Solo un Administrador puede gestionar usuarios.", status: 403 as const };
  }
  return { user };
}

// ---- Crear usuario ---------------------------------------------------------
export async function POST(request: Request) {
  const guard = await exigirAdministrador();
  if ("error" in guard) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  if (!serviceRoleConfigurado) {
    return NextResponse.json(
      { error: "Falta configurar SUPABASE_SERVICE_ROLE_KEY en el servidor." },
      { status: 500 }
    );
  }

  let body: { email?: string; password?: string; nombre?: string; rol?: string; bodega_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  }

  const email = (body.email ?? "").trim().toLowerCase();
  const password = body.password ?? "";
  const nombre = (body.nombre ?? "").trim();
  const rol = (body.rol ?? "Visualizador") as RolUsuario;
  const bodegaId = (body.bodega_id ?? "").trim() || null;

  if (!email || !password || !nombre) {
    return NextResponse.json({ error: "Correo, contraseña y nombre son obligatorios." }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json({ error: "La contraseña debe tener al menos 6 caracteres." }, { status: 400 });
  }
  if (!ROLES_VALIDOS.includes(rol)) {
    return NextResponse.json({ error: "Rol inválido." }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // queda habilitado para entrar de inmediato
    user_metadata: { nombre, rol },
  });

  if (error) {
    const msg = /already.*registered|exists/i.test(error.message)
      ? "Ya existe un usuario con ese correo."
      : error.message;
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  // Forzar cambio de contrasena en el primer ingreso (la crea el admin con clave temporal).
  // Si se asignó una bodega, el usuario queda acotado a ella (bodega única).
  if (data.user) {
    await admin
      .from("usuarios")
      .update({ debe_cambiar_password: true, bodega_id: bodegaId })
      .eq("auth_user_id", data.user.id);
  }

  return NextResponse.json({ ok: true, id: data.user?.id });
}

// ---- Eliminar usuario (revoca el acceso por completo) ----------------------
export async function DELETE(request: Request) {
  const guard = await exigirAdministrador();
  if ("error" in guard) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  if (!serviceRoleConfigurado) {
    return NextResponse.json(
      { error: "Falta configurar SUPABASE_SERVICE_ROLE_KEY en el servidor." },
      { status: 500 }
    );
  }

  const { searchParams } = new URL(request.url);
  const usuarioId = searchParams.get("usuarioId");
  const authUserId = searchParams.get("authUserId");

  if (!usuarioId) {
    return NextResponse.json({ error: "Falta el identificador del usuario." }, { status: 400 });
  }
  if (authUserId && authUserId === guard.user.id) {
    return NextResponse.json({ error: "No puedes eliminar tu propia cuenta." }, { status: 400 });
  }

  const admin = getSupabaseAdmin();

  // 1) Eliminar la cuenta de acceso (auth) si está enlazada.
  if (authUserId) {
    const { error } = await admin.auth.admin.deleteUser(authUserId);
    if (error && !/not found/i.test(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
  }

  // 2) Eliminar el perfil interno.
  const { error: e2 } = await admin.from("usuarios").delete().eq("id", usuarioId);
  if (e2) {
    return NextResponse.json({ error: e2.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
