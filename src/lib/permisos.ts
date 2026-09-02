import type { RolUsuario } from "@/lib/types";

/**
 * Matriz de acceso por rol (prefijos de ruta permitidos).
 * - TODOS los roles ven TODAS las vistas operativas del sistema.
 * - Únicas zonas restringidas (solo Administrador): Usuarios y Auditoría.
 * - Si un usuario tiene una BODEGA ASIGNADA (bodeguero de bodega única), queda
 *   acotado a su bodega: sólo ve los módulos operativos de stock y nada de
 *   administración ni otras áreas.
 */

// Todo lo operativo: visible para cualquier usuario autenticado.
const RUTAS_COMUNES = [
  "/dashboard",
  "/materiales",
  "/bodegas",
  "/inventario",
  "/movimientos",
  "/proyectos",
  "/herramientas",
  "/proveedores",
  "/facturas",
  "/abastecimiento",
];

// Zonas de administración: solo Administrador.
const RUTAS_ADMIN = ["/usuarios", "/auditoria"];

// Bodeguero de bodega única: sólo su operación de stock (la data se acota por RLS).
const RUTAS_BODEGA_UNICA = [
  "/dashboard",
  "/materiales",
  "/inventario",
  "/movimientos",
  "/herramientas",
];

const ACCESO: Record<RolUsuario, string[]> = {
  Administrador: [...RUTAS_COMUNES, ...RUTAS_ADMIN],
  "Jefe de Proyecto": [...RUTAS_COMUNES],
  Bodeguero: [...RUTAS_COMUNES],
  Adquisiciones: [...RUTAS_COMUNES],
  Visualizador: [...RUTAS_COMUNES],
};

/** Rutas (prefijos) permitidas para un rol. Con bodega asignada manda el set acotado. */
export function rutasPermitidas(rol: RolUsuario | null, tieneBodega = false): string[] {
  if (tieneBodega) return RUTAS_BODEGA_UNICA;
  if (!rol) return [];
  return ACCESO[rol] ?? [];
}

/** ¿El rol puede acceder a esta ruta? La página neutra /sin-acceso es siempre accesible. */
export function puedeAcceder(
  rol: RolUsuario | null,
  path: string,
  tieneBodega = false
): boolean {
  if (path.startsWith("/sin-acceso")) return true;
  return rutasPermitidas(rol, tieneBodega).some(
    (base) => path === base || path.startsWith(base + "/")
  );
}

/** Primera ruta disponible para el rol (a dónde enviarlo al entrar). */
export function rutaInicial(rol: RolUsuario | null, tieneBodega = false): string {
  const permitidas = rutasPermitidas(rol, tieneBodega);
  return permitidas[0] ?? "/sin-acceso";
}
