import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";

/** Obtiene el cliente de servidor y el usuario autenticado de la petición. */
export async function getSesionApi() {
  const supabase = getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

/** Respuesta 401 estándar. */
export function noAutenticado() {
  return NextResponse.json({ error: "No autenticado." }, { status: 401 });
}

/**
 * Traduce un error de Supabase/PostgreSQL a una respuesta HTTP adecuada:
 *  - 403 si es falta de permisos (rol).
 *  - 409 si es una desviación de presupuesto (sobregiro) → la UI puede ofrecer forzar.
 *  - 400 para el resto.
 */
export function errorRpc(error: { message?: string; code?: string } | null) {
  const code = error?.code ?? "";
  let msg = error?.message ?? "Ocurrió un error en la operación.";
  let status = 400;
  let sobregiro = false;

  if (code === "42501" || /no autorizado/i.test(msg)) {
    status = 403;
  } else if (code === "P0001" || /DESVIACION_PRESUPUESTO/i.test(msg)) {
    status = 409;
    sobregiro = true;
    msg = msg.replace("DESVIACION_PRESUPUESTO: ", "");
  } else if (/chk_rut_valido|fn_validar_rut/i.test(msg)) {
    msg = "El RUT ingresado no es válido (formato chileno, ej: 76.123.456-7).";
  } else if (code === "23505") {
    msg = "Ya existe un registro con esos datos (duplicado).";
  }

  return NextResponse.json({ error: msg, sobregiro }, { status });
}
