import { NextResponse } from "next/server";
import { getSesionApi, noAutenticado, errorRpc } from "@/lib/api-auth";

/**
 * GET /api/abastecimiento/comparar-precios?q=<producto>
 * Inteligencia de abastecimiento: devuelve, por proveedor, el mejor precio
 * histórico del ítem buscado, su última compra y el folio de referencia,
 * ordenado de menor a mayor precio.
 */
export async function GET(request: Request) {
  const { supabase, user } = await getSesionApi();
  if (!user) return noAutenticado();

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim();
  if (q.length < 2) {
    return NextResponse.json(
      { error: "Ingresa al menos 2 caracteres para buscar." },
      { status: 400 }
    );
  }

  const { data, error } = await supabase.rpc("fn_comparar_precios", { p_busqueda: q });
  if (error) return errorRpc(error);
  return NextResponse.json({ resultados: data ?? [] });
}
