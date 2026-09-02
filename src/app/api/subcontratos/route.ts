import { NextResponse } from "next/server";
import { getSesionApi, noAutenticado, errorRpc } from "@/lib/api-auth";

/**
 * GET /api/subcontratos[?proyecto_id=...]
 * Lista subcontratos (RLS: solo Administrador / Jefe de Proyecto).
 */
export async function GET(request: Request) {
  const { supabase, user } = await getSesionApi();
  if (!user) return noAutenticado();

  const { searchParams } = new URL(request.url);
  const proyectoId = searchParams.get("proyecto_id");

  let query = supabase.from("subcontratos").select("*").order("created_at", { ascending: false });
  if (proyectoId) query = query.eq("proyecto_id", proyectoId);

  const { data, error } = await query;
  if (error) return errorRpc(error);
  return NextResponse.json({ subcontratos: data });
}

/**
 * POST /api/subcontratos
 * Crea un subcontrato → marca su monto como COMPROMETIDO en el proyecto (atómico).
 * Valida desviación presupuestaria; bloquea sobregiro salvo forzar=true.
 * Body: { proyecto_id, proveedor_id, glosa, monto_total, forzar? }
 */
export async function POST(request: Request) {
  const { supabase, user } = await getSesionApi();
  if (!user) return noAutenticado();

  const body = await request.json().catch(() => null);
  if (!body?.proyecto_id || !body?.proveedor_id || !body?.glosa || !body?.monto_total) {
    return NextResponse.json(
      { error: "proyecto_id, proveedor_id, glosa y monto_total son obligatorios." },
      { status: 400 }
    );
  }

  const { data, error } = await supabase.rpc("fn_crear_subcontrato", {
    p_proyecto_id: body.proyecto_id,
    p_proveedor_id: body.proveedor_id,
    p_glosa: body.glosa,
    p_monto_total: Number(body.monto_total),
    p_forzar: Boolean(body.forzar),
  });

  if (error) return errorRpc(error);
  return NextResponse.json({ id: data }, { status: 201 });
}

/**
 * PATCH /api/subcontratos?id=...&accion=finalizar
 */
export async function PATCH(request: Request) {
  const { supabase, user } = await getSesionApi();
  if (!user) return noAutenticado();

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  const accion = searchParams.get("accion");
  if (!id) return NextResponse.json({ error: "Falta el id." }, { status: 400 });

  if (accion === "finalizar") {
    const { error } = await supabase.rpc("fn_finalizar_subcontrato", { p_subcontrato_id: id });
    if (error) return errorRpc(error);
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Acción no soportada." }, { status: 400 });
}
