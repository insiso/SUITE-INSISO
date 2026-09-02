// ============================================================================
//  Extracción de datos desde imágenes/PDF con IA de visión.
//  Cliente: reduce la imagen y la manda a /api/extraer.
// ============================================================================

export type TipoExtraccion = "proveedor" | "material" | "factura";

async function imagenReducida(file: File, maxLado = 1500, calidad = 0.8): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("No se pudo leer la imagen."));
      i.src = url;
    });
    let { width, height } = img;
    if (width > maxLado || height > maxLado) {
      const escala = maxLado / Math.max(width, height);
      width = Math.round(width * escala);
      height = Math.round(height * escala);
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas no disponible.");
    ctx.drawImage(img, 0, 0, width, height);
    const dataUrl = canvas.toDataURL("image/jpeg", calidad);
    return dataUrl.split(",")[1] ?? "";
  } finally {
    URL.revokeObjectURL(url);
  }
}

function leerBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(new Error("No se pudo leer el archivo."));
    r.readAsDataURL(file);
  });
}

/** Extrae datos estructurados desde un archivo (imagen o PDF) usando IA. */
export async function extraerDesdeArchivo<T = Record<string, unknown>>(
  tipo: TipoExtraccion,
  file: File
): Promise<T> {
  const esPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  const base64 = esPdf ? await leerBase64(file) : await imagenReducida(file);
  const mimeType = esPdf ? "application/pdf" : "image/jpeg";

  const res = await fetch("/api/extraer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tipo, base64, mimeType }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "No se pudo extraer la información.");
  return json.datos as T;
}
