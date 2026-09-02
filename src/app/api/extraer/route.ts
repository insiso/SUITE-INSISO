import { NextResponse } from "next/server";
import { getSesionApi, noAutenticado } from "@/lib/api-auth";

export const maxDuration = 60;

type Tipo = "proveedor" | "material" | "factura";

const INSTRUCCIONES: Record<Tipo, string> = {
  proveedor:
    'Extrae los datos del PROVEEDOR desde este documento (tarjeta de presentación, membrete, correo o ficha). ' +
    'Devuelve SOLO un JSON con esta forma exacta: ' +
    '{"rut": string|null, "razon_social": string|null, "contacto": string|null, "email": string|null, "telefono": string|null, "categoria": string|null, "direccion": string|null}. ' +
    'El RUT chileno con puntos y guión (ej: 76.123.456-7). "razon_social" es el nombre de la empresa; "contacto" es la persona.',
  material:
    'Extrae TODOS los materiales/ítems del documento (listado, cotización o guía). ' +
    'Devuelve SOLO un JSON con esta forma: ' +
    '{"items": [{"sku": string|null, "descripcion": string, "categoria": string|null, "unidad_medida": string|null, "precio_unitario": number|null}]}. ' +
    'Un objeto por ítem. "precio_unitario" como número entero en pesos, sin puntos ni símbolos.',
  factura:
    'Extrae los datos de la FACTURA (chilena) desde este documento. ' +
    'Devuelve SOLO un JSON con esta forma: ' +
    '{"rut_proveedor": string|null, "razon_social_proveedor": string|null, "numero_factura": string|null, "fecha": string|null, "monto_total": number|null, ' +
    '"items": [{"producto": string, "cantidad": number|null, "precio_unitario": number|null}]}. ' +
    'La fecha en formato YYYY-MM-DD. Los montos como número entero en pesos chilenos, sin puntos ni símbolos.',
};

const SISTEMA =
  "Eres un asistente experto en leer documentos chilenos del rubro construcción. " +
  "Respondes ÚNICAMENTE con un JSON válido, sin explicaciones ni texto adicional y sin usar bloques de código. " +
  "Usa null cuando un dato no aparezca. No inventes datos.";

function extraerJson(texto: string): unknown {
  let t = texto.trim();
  // quita cercos ```json ... ```
  t = t.replace(/^```(?:json)?/i, "").replace(/```$/,"").trim();
  const ini = t.indexOf("{");
  const fin = t.lastIndexOf("}");
  if (ini >= 0 && fin > ini) t = t.slice(ini, fin + 1);
  return JSON.parse(t);
}

export async function POST(request: Request) {
  const { user } = await getSesionApi();
  if (!user) return noAutenticado();

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "Falta configurar la llave de IA (ANTHROPIC_API_KEY) en el servidor. Pídele al administrador que la agregue en Vercel.",
      },
      { status: 400 }
    );
  }

  let body: { tipo?: Tipo; base64?: string; mimeType?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  }

  const tipo = body.tipo as Tipo;
  const base64 = body.base64 ?? "";
  const mimeType = body.mimeType ?? "image/jpeg";
  if (!tipo || !INSTRUCCIONES[tipo]) {
    return NextResponse.json({ error: "Tipo de documento no válido." }, { status: 400 });
  }
  if (!base64) {
    return NextResponse.json({ error: "No se recibió el archivo." }, { status: 400 });
  }

  const esPdf = mimeType === "application/pdf";
  const bloqueArchivo = esPdf
    ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } }
    : { type: "image", source: { type: "base64", media_type: mimeType, data: base64 } };

  const modelo = process.env.EXTRACT_MODEL || "claude-3-5-sonnet-latest";

  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: modelo,
        max_tokens: 2000,
        system: SISTEMA,
        messages: [
          {
            role: "user",
            content: [bloqueArchivo, { type: "text", text: INSTRUCCIONES[tipo] }],
          },
        ],
      }),
    });

    const data = await resp.json();
    if (!resp.ok) {
      const msg = data?.error?.message || "La IA no pudo procesar el documento.";
      return NextResponse.json({ error: `Error de IA: ${msg}` }, { status: 502 });
    }

    const texto: string =
      Array.isArray(data?.content) && data.content[0]?.type === "text" ? data.content[0].text : "";
    if (!texto) {
      return NextResponse.json({ error: "La IA no devolvió datos legibles." }, { status: 502 });
    }

    let datos: unknown;
    try {
      datos = extraerJson(texto);
    } catch {
      return NextResponse.json(
        { error: "No se pudo interpretar la respuesta de la IA. Intenta con una foto más nítida." },
        { status: 502 }
      );
    }

    return NextResponse.json({ datos });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error inesperado.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
