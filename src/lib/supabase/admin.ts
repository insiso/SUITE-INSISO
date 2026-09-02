import "server-only";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

export const serviceRoleConfigurado = Boolean(supabaseUrl && serviceRoleKey);

/**
 * Cliente ADMINISTRADOR (service_role). Usa privilegios elevados y omite RLS.
 * ⚠️ SOLO debe usarse en el servidor (route handlers / server actions).
 * Nunca se expone al navegador: la clave NO lleva el prefijo NEXT_PUBLIC_.
 */
export function getSupabaseAdmin() {
  if (!serviceRoleConfigurado) {
    throw new Error(
      "Falta SUPABASE_SERVICE_ROLE_KEY en el entorno. Agrégala en .env.local (y en Vercel) para poder crear usuarios."
    );
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
