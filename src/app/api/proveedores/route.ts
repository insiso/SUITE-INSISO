import { NextResponse } from "next/server";
import { getSesionApi, noAutenticado, errorRpc } from "@/lib/api-auth";

/**
 * GET /api/proveedores
 * Lista los proveedores (filtrados por RLS según el rol del usuario).
 */
export async function GET() {
  const { supabase, user } = await getSesionApi();
  if (!user) return noAutenticado();

  const { data, error } = await supabase
    .from("proveedores")
    .select("*")
    .order("razon_social");

  if (error) return errorRpc(error);
  return NextResponse.json({ proveedores: data });
}

/**
 * POST /api/proveedores
 * Crea un proveedor. El RUT se valida en la base de datos (formato chileno).
 * Body: { rut, razon_social, contacto?, email?, telefono?, categoria? }
 */
export async function POST(request: Request) {
  const { supabase, user } = await getSesionApi();
  if (!user) return noAutenticado();

  let body: Record<string, string>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  }

  const rut = (body.rut ?? "").trim();
  const razon_social = (body.razon_social ?? "").trim();
  if (!rut || !razon_social) {
    return NextResponse.json(
      { error: "RUT y Razón Social son obligatorios." },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("proveedores")
    .insert({
      rut,
      razon_social,
      contacto: body.contacto?.trim() || null,
      email: body.email?.trim() || null,
      telefono: body.telefono?.trim() || null,
      categoria: body.categoria?.trim() || null,
      direccion: body.direccion?.trim() || null,
      tipo_pago: body.tipo_pago?.trim() || null,
    })
    .select()
    .single();

  if (error) return errorRpc(error);
  return NextResponse.json({ proveedor: data }, { status: 201 });
}
