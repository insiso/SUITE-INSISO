import { NextResponse } from "next/server";
import { getSesionApi, noAutenticado, errorRpc } from "@/lib/api-auth";

/**
 * GET /api/facturas[?proyecto_id=...][?subcontrato_id=...]
 * Lista facturas (RLS: Administrador / Jefe de Proyecto / Adquisiciones).
 */
export async function GET(request: Request) {
  const { supabase, user } = await getSesionApi();
  if (!user) return noAutenticado();

  const { searchParams } = new URL(request.url);
  let query = supabase.from("facturas").select("*").order("fecha", { ascending: false });
  const proyectoId = searchParams.get("proyecto_id");
  const subcontratoId = searchParams.get("subcontrato_id");
  if (proyectoId) query = query.eq("proyecto_id", proyectoId);
  if (subcontratoId) query = query.eq("subcontrato_id", subcontratoId);

  const { data, error } = await query;
  if (error) return errorRpc(error);
  return NextResponse.json({ facturas: data });
}

/**
 * POST /api/facturas
 * Crea una factura (estado Pendiente) con su detalle de ítems. Aún no impacta
 * el presupuesto (eso ocurre al aprobarla). Transacción atómica.
 * Body: {
 *   numero_factura, proveedor_id, proyecto_id, subcontrato_id?, fecha?, monto_total?,
 *   detalles?: [{ producto, cantidad, precio_unitario }]
 * }
 */
export async function POST(request: Request) {
  const { supabase, user } = await getSesionApi();
  if (!user) return noAutenticado();

  const body = await request.json().catch(() => null);
  if (!body?.numero_factura || !body?.proveedor_id || !body?.proyecto_id) {
    return NextResponse.json(
      { error: "numero_factura, proveedor_id y proyecto_id son obligatorios." },
      { status: 400 }
    );
  }

  const { data, error } = await supabase.rpc("fn_crear_factura", {
    p_numero: body.numero_factura,
    p_proveedor_id: body.proveedor_id,
    p_proyecto_id: body.proyecto_id,
    p_subcontrato_id: body.subcontrato_id ?? null,
    p_fecha: body.fecha ?? null,
    p_monto_total: body.monto_total != null ? Number(body.monto_total) : 0,
    p_detalles: Array.isArray(body.detalles) ? body.detalles : [],
  });

  if (error) return errorRpc(error);
  return NextResponse.json({ id: data }, { status: 201 });
}

/**
 * PATCH /api/facturas?id=...&accion=aprobar|pagar[&forzar=true]
 *  - aprobar: impacta el presupuesto (mueve comprometido→real o suma costo directo).
 *  - pagar:   marca la factura como Pagada.
 */
export async function PATCH(request: Request) {
  const { supabase, user } = await getSesionApi();
  if (!user) return noAutenticado();

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  const accion = searchParams.get("accion");
  const forzar = searchParams.get("forzar") === "true";
  if (!id) return NextResponse.json({ error: "Falta el id." }, { status: 400 });

  if (accion === "aprobar") {
    const { data, error } = await supabase.rpc("fn_aprobar_factura", {
      p_factura_id: id,
      p_forzar: forzar,
    });
    if (error) return errorRpc(error);
    return NextResponse.json({ ok: true, ...(data ?? {}) });
  }

  if (accion === "pagar") {
    const { error } = await supabase.rpc("fn_pagar_factura", { p_factura_id: id });
    if (error) return errorRpc(error);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Acción no soportada." }, { status: 400 });
}
