import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";

/** Combina clases de Tailwind de forma segura. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Formatea un número como moneda chilena (CLP, sin decimales). */
export function formatCLP(valor: number | null | undefined): string {
  const n = Number(valor ?? 0);
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(n);
}

/** Formatea un número con separador de miles (es-CL). */
export function formatNumero(valor: number | null | undefined, decimales = 0): string {
  const n = Number(valor ?? 0);
  return new Intl.NumberFormat("es-CL", {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  }).format(n);
}

/** Formatea un porcentaje. */
export function formatPorcentaje(valor: number | null | undefined, decimales = 1): string {
  const n = Number(valor ?? 0);
  return `${formatNumero(n, decimales)}%`;
}

/** Formatea una fecha ISO a dd/MM/yyyy. */
export function formatFecha(fecha: string | null | undefined): string {
  if (!fecha) return "—";
  try {
    return format(parseISO(fecha), "dd/MM/yyyy", { locale: es });
  } catch {
    return "—";
  }
}

/** Formatea fecha y hora a dd/MM/yyyy HH:mm. */
export function formatFechaHora(fecha: string | null | undefined): string {
  if (!fecha) return "—";
  try {
    return format(parseISO(fecha), "dd/MM/yyyy HH:mm", { locale: es });
  } catch {
    return "—";
  }
}

/** Devuelve un mensaje legible a partir de un error desconocido. */
export function mensajeError(error: unknown): string {
  if (!error) return "Error desconocido";
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return "Ocurrió un error inesperado";
}

/** Genera un código correlativo simple a partir de un prefijo y un número. */
export function generarCodigo(prefijo: string, numero: number, largo = 3): string {
  return `${prefijo}-${String(numero).padStart(largo, "0")}`;
}

/** Valida un RUT chileno (módulo 11). Acepta con/sin puntos, con guión. */
export function validarRut(rut: string | null | undefined): boolean {
  if (!rut) return false;
  const limpio = rut.replace(/[.\s]/g, "").toUpperCase();
  if (!/^[0-9]+-[0-9K]$/.test(limpio)) return false;
  const [cuerpo, dv] = limpio.split("-");
  if (cuerpo.length < 7) return false;
  let suma = 0;
  let mult = 2;
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += parseInt(cuerpo[i], 10) * mult;
    mult = mult === 7 ? 2 : mult + 1;
  }
  const resto = 11 - (suma % 11);
  const dvCalc = resto === 11 ? "0" : resto === 10 ? "K" : String(resto);
  return dvCalc === dv;
}

/** Da formato a un RUT: 12345678-9 → 12.345.678-9 */
export function formatRut(rut: string | null | undefined): string {
  if (!rut) return "—";
  const limpio = rut.replace(/[.\s]/g, "").toUpperCase();
  if (!/^[0-9]+-[0-9K]$/.test(limpio)) return rut;
  const [cuerpo, dv] = limpio.split("-");
  return `${cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, ".")}-${dv}`;
}
