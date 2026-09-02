import type {
  CategoriaPresupuesto,
  EstadoHerramienta,
  EstadoProyecto,
  RolUsuario,
  TipoBodega,
  TipoMovimiento,
} from "@/lib/types";

export const APP_NOMBRE = "ERP FAPAMA";
export const APP_EMPRESA = "FAPAMA Ing y Construcción SpA";

export const TIPOS_PAGO = [
  "Contado",
  "Crédito 30 días",
  "Crédito 60 días",
  "Crédito 90 días",
] as const;

export const UNIDADES_MEDIDA = [
  "un",
  "sc",
  "kg",
  "ton",
  "m",
  "ml",
  "m2",
  "m3",
  "lt",
  "gl",
  "caja",
  "rollo",
  "par",
  "resma",
  "tineta",
  "manga",
] as const;

export const CATEGORIAS_PRESUPUESTO: CategoriaPresupuesto[] = [
  "Materiales",
  "Mano de Obra",
  "Herramientas",
  "Equipos",
  "Subcontratos",
  "Otros",
];

export const ESTADOS_PROYECTO: EstadoProyecto[] = [
  "Planificación",
  "Activo",
  "Suspendido",
  "Cerrado",
];

export const TIPOS_BODEGA: TipoBodega[] = ["Central", "Proyecto", "Virtual", "Tránsito"];

export const ROLES_USUARIO: RolUsuario[] = [
  "Administrador",
  "Jefe de Proyecto",
  "Bodeguero",
  "Adquisiciones",
  "Visualizador",
];

export const TIPOS_MOVIMIENTO: TipoMovimiento[] = ["ENTRADA", "SALIDA", "TRASPASO"];

export const ETIQUETA_MOVIMIENTO: Record<TipoMovimiento, string> = {
  ENTRADA: "Entrada de Mercancías",
  SALIDA: "Salida / Consumo",
  TRASPASO: "Traspaso entre Bodegas",
  AJUSTE: "Ajuste de Inventario",
};

export const ESTADOS_HERRAMIENTA: EstadoHerramienta[] = [
  "DISPONIBLE",
  "PRESTADA",
  "MANTENCION",
  "BAJA",
];

export const ETIQUETA_ESTADO_HERRAMIENTA: Record<EstadoHerramienta, string> = {
  DISPONIBLE: "Disponible",
  PRESTADA: "Prestada",
  MANTENCION: "En Mantención",
  BAJA: "Dada de Baja",
};

// ---- Mapas de color para badges (clases Tailwind) --------------------------

export const COLOR_ESTADO_PROYECTO: Record<EstadoProyecto, string> = {
  Planificación: "bg-blue-100 text-blue-700 ring-blue-200",
  Activo: "bg-emerald-100 text-emerald-700 ring-emerald-200",
  Suspendido: "bg-amber-100 text-amber-700 ring-amber-200",
  Cerrado: "bg-slate-100 text-slate-600 ring-slate-200",
};

export const COLOR_ESTADO_HERRAMIENTA: Record<EstadoHerramienta, string> = {
  DISPONIBLE: "bg-emerald-100 text-emerald-700 ring-emerald-200",
  PRESTADA: "bg-blue-100 text-blue-700 ring-blue-200",
  MANTENCION: "bg-amber-100 text-amber-700 ring-amber-200",
  BAJA: "bg-rose-100 text-rose-700 ring-rose-200",
};

export const COLOR_MOVIMIENTO: Record<TipoMovimiento, string> = {
  ENTRADA: "bg-emerald-100 text-emerald-700 ring-emerald-200",
  SALIDA: "bg-rose-100 text-rose-700 ring-rose-200",
  TRASPASO: "bg-blue-100 text-blue-700 ring-blue-200",
  AJUSTE: "bg-violet-100 text-violet-700 ring-violet-200",
};

export const SEGMENTOS_MATERIAL = ["Construcción", "Aseo", "Oficina", "EPP", "Eléctricos", "Otros"] as const;
