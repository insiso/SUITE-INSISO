// ============================================================================
//  Ayudante de Excel (importar / exportar) — usa SheetJS (xlsx) con import
//  dinámico para no cargar la librería hasta que se usa.
// ============================================================================

export type FilaExcel = Record<string, string | number | boolean | null | undefined>;

/** Exporta un arreglo de objetos a un archivo .xlsx y lo descarga. */
export async function exportarExcel(
  nombreArchivo: string,
  filas: FilaExcel[],
  hoja = "Datos"
): Promise<void> {
  const XLSX = await import("xlsx");
  const ws = XLSX.utils.json_to_sheet(filas.length ? filas : [{}]);

  // Formato "pro": autofiltro (tabla desplegable) + ancho de columnas automático
  if (filas.length && ws["!ref"]) {
    ws["!autofilter"] = { ref: ws["!ref"] };
    const columnas = Object.keys(filas[0]);
    ws["!cols"] = columnas.map((c) => {
      const anchoContenido = filas.reduce((max, fila) => {
        const v = fila[c];
        const largo = v === null || v === undefined ? 0 : String(v).length;
        return Math.max(max, largo);
      }, c.length);
      return { wch: Math.min(Math.max(anchoContenido + 2, 10), 50) };
    });
    // Congela la fila de encabezado
    ws["!freeze"] = { xSplit: 0, ySplit: 1, topLeftCell: "A2", activePane: "bottomLeft", state: "frozen" };
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, hoja);
  const nombre = nombreArchivo.toLowerCase().endsWith(".xlsx")
    ? nombreArchivo
    : `${nombreArchivo}.xlsx`;
  XLSX.writeFile(wb, nombre);
}

/** Descarga una plantilla .xlsx con encabezados y filas de ejemplo. */
export async function descargarPlantilla(
  nombreArchivo: string,
  ejemplo: FilaExcel[],
  hoja = "Plantilla"
): Promise<void> {
  return exportarExcel(nombreArchivo, ejemplo, hoja);
}

/** Lee la primera hoja de un archivo Excel/CSV y devuelve filas como objetos. */
export async function leerExcel(file: File): Promise<Record<string, unknown>[]> {
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const primera = wb.SheetNames[0];
  if (!primera) return [];
  const ws = wb.Sheets[primera];
  return XLSX.utils.sheet_to_json(ws, { defval: "" }) as Record<string, unknown>[];
}

function normalizarClave(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

/** Lee una celda por nombre de columna, tolerante a acentos/mayúsculas/espacios. */
export function valorCampo(fila: Record<string, unknown>, ...claves: string[]): string {
  const objNorm = new Map<string, unknown>();
  for (const k of Object.keys(fila)) objNorm.set(normalizarClave(k), fila[k]);
  for (const c of claves) {
    const v = objNorm.get(normalizarClave(c));
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

export function esVerdadero(v: string): boolean {
  const s = v.toLowerCase().trim();
  return ["si", "sí", "1", "true", "verdadero", "x", "yes"].includes(s);
}
