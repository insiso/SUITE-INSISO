"use client";

import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/**
 * Indica si las credenciales de Supabase están configuradas.
 * Útil para mostrar mensajes claros en la UI cuando falta el .env.local
 */
export const supabaseConfigurado = Boolean(supabaseUrl && supabaseAnonKey);

let cliente: ReturnType<typeof createBrowserClient> | null = null;

/**
 * Cliente de Supabase para el navegador (singleton).
 * Usa la clave pública "anon", protegida por las políticas RLS de la base.
 */
export function getSupabaseClient() {
  if (!supabaseConfigurado) {
    throw new Error(
      "Faltan las credenciales de Supabase. Copia .env.local.example a .env.local y completa NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY."
    );
  }
  if (!cliente) {
    cliente = createBrowserClient(supabaseUrl, supabaseAnonKey);
  }
  return cliente;
}
