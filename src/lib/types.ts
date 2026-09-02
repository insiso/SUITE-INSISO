// ============================================================================
//  Tipos de dominio del ERP (espejo del esquema de la base de datos)
// ============================================================================

export type RolUsuario =
  | "Administrador"
  | "Jefe de Proyecto"
  | "Bodeguero"
  | "Adquisiciones"
  | "Visualizador";

export type EstadoProyecto = "Planificación" | "Activo" | "Suspendido" | "Cerrado";

export type CategoriaPresupuesto =
  | "Materiales"
  | "Mano de Obra"
  | "Herramientas"
  | "Equipos"
  | "Subcontratos"
  | "Otros";

export type TipoBodega = "Central" | "Proyecto" | "Virtual" | "Tránsito";

export type TipoMovimiento = "ENTRADA" | "SALIDA" | "TRASPASO" | "AJUSTE";

export type EstadoHerramienta = "DISPONIBLE" | "PRESTADA" | "MANTENCION" | "BAJA";

export type EstadoPrestamo = "PRESTADA" | "DEVUELTA";

export interface Usuario {
  id: string;
  auth_user_id: string | null;
  nombre: string;
  email: string;
  rol: RolUsuario;
  telefono: string | null;
  bodega_id: string | null;
  activo: boolean;
  debe_cambiar_password: boolean;
  created_at: string;
  updated_at: string;
}

export interface Proyecto {
  id: string;
  codigo: string;
  nombre: string;
  ubicacion: string | null;
  descripcion: string | null;
  fecha_inicio: string | null;
  fecha_termino: string | null;
  presupuesto_total: number;
  estado: EstadoProyecto;
  responsable_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Presupuesto {
  id: string;
  proyecto_id: string;
  categoria: CategoriaPresupuesto;
  descripcion: string | null;
  monto_asignado: number;
  created_at: string;
  updated_at: string;
}

export interface Material {
  id: string;
  sku: string;
  descripcion: string;
  categoria: string | null;
  segmento: string;
  unidad_medida: string;
  precio_unitario: number;
  stock_minimo: number;
  activo: boolean;
  created_at: string;
  updated_at: string;
}

export interface Bodega {
  id: string;
  codigo: string;
  nombre: string;
  tipo: TipoBodega;
  ubicacion: string | null;
  proyecto_id: string | null;
  activo: boolean;
  created_at: string;
  updated_at: string;
}

export interface MovimientoKardex {
  id: string;
  folio: number;
  tipo: TipoMovimiento;
  material_id: string;
  cantidad: number;
  costo_unitario: number;
  bodega_origen_id: string | null;
  bodega_destino_id: string | null;
  proyecto_id: string | null;
  usuario_id: string | null;
  concepto: string | null;
  fecha: string;
  created_at: string;
  reversa_de: string | null;
}

export interface Herramienta {
  id: string;
  codigo: string;
  nombre: string;
  descripcion: string | null;
  categoria: string | null;
  estado: EstadoHerramienta;
  bodega_id: string | null;
  valor: number;
  arrendada: boolean;
  valor_arriendo: number;
  periodo_arriendo: string | null;
  por_cantidad: boolean;
  cantidad: number;
  created_at: string;
  updated_at: string;
}

export interface PrestamoHerramienta {
  id: string;
  herramienta_id: string;
  usuario_id: string | null;
  proyecto_id: string | null;
  responsable_nombre: string;
  fecha_entrega: string;
  fecha_devolucion: string | null;
  estado: EstadoPrestamo;
  observaciones: string | null;
  created_at: string;
  updated_at: string;
}

export interface MovimientoHerramienta {
  id: string;
  herramienta_id: string;
  cantidad: number;
  bodega_origen_id: string | null;
  bodega_destino_id: string | null;
  usuario_id: string | null;
  motivo: string | null;
  fecha: string;
  created_at: string;
}

export interface Gasto {
  id: string;
  proyecto_id: string;
  presupuesto_id: string | null;
  categoria: CategoriaPresupuesto;
  descripcion: string | null;
  monto: number;
  fecha: string;
  created_at: string;
  updated_at: string;
}

// ---- Vistas (solo lectura) -------------------------------------------------

export interface VistaInventario {
  id: string;
  material_id: string;
  sku: string;
  material: string;
  categoria: string | null;
  unidad_medida: string;
  precio_unitario: number;
  stock_minimo: number;
  bodega_id: string;
  bodega_codigo: string;
  bodega: string;
  cantidad: number;
  valor_total: number;
  alerta_stock_bajo: boolean;
  updated_at: string;
}

export interface VistaStockTotal {
  material_id: string;
  sku: string;
  material: string;
  unidad_medida: string;
  stock_minimo: number;
  precio_unitario: number;
  stock_total: number;
  valor_total: number;
  alerta_stock_bajo: boolean;
}

export interface VistaDesviacion {
  proyecto_id: string;
  categoria: CategoriaPresupuesto;
  asignado: number;
  gastado: number;
  saldo: number;
}

export interface VistaResumenProyecto {
  id: string;
  codigo: string;
  nombre: string;
  estado: EstadoProyecto;
  ubicacion: string | null;
  fecha_inicio: string | null;
  fecha_termino: string | null;
  presupuesto_total: number;
  gasto_real: number;
  saldo: number;
  porcentaje_ejecucion: number;
}

// ---- Finanzas / Abastecimiento / Subcontratos ------------------------------

export type EstadoSubcontrato = "Vigente" | "Finalizado" | "Anulado";
export type EstadoFactura = "Pendiente" | "Aprobada" | "Pagada" | "Anulada";

export interface Proveedor {
  id: string;
  rut: string;
  razon_social: string;
  direccion: string | null;
  contacto: string | null;
  email: string | null;
  telefono: string | null;
  categoria: string | null;
  tipo_pago: string | null;
  activo: boolean;
  created_at: string;
  updated_at: string;
}

export interface EvaluacionProveedor {
  id: string;
  proveedor_id: string;
  periodo: string | null;
  fecha: string;
  entrega: number;
  calidad: number;
  precio: number;
  distancia: number;
  tipo_pago: number;
  promedio: number;
  comentario: string | null;
  usuario_id: string | null;
  created_at: string;
}

export interface Subcontrato {
  id: string;
  proyecto_id: string;
  proveedor_id: string;
  glosa: string;
  monto_total_contratado: number;
  monto_ejecutado: number;
  estado: EstadoSubcontrato;
  created_at: string;
  updated_at: string;
}

export interface Factura {
  id: string;
  numero_factura: string;
  proveedor_id: string;
  proyecto_id: string;
  subcontrato_id: string | null;
  monto_total: number;
  fecha: string;
  estado: EstadoFactura;
  created_at: string;
  updated_at: string;
}

export interface DetalleFactura {
  id: string;
  factura_id: string;
  producto: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
  created_at: string;
}

/** Resultado de fn_estado_presupuesto / vista_control_presupuestal */
export interface ControlPresupuestal {
  presupuesto: number;
  comprometido: number;
  costo_real: number;
  disponible: number;
}

/** Fila del comparador de precios (fn_comparar_precios) */
export interface ComparadorPrecio {
  proveedor_id: string;
  razon_social: string;
  producto: string;
  mejor_precio: number;
  ultima_compra: string;
  numero_factura: string;
}

/** Ítem de detalle al crear una factura */
export interface DetalleFacturaInput {
  producto: string;
  cantidad: number;
  precio_unitario: number;
}

export interface BodegaProyecto {
  bodega_id: string;
  proyecto_id: string;
  created_at: string;
}

export interface HerramientaStock {
  herramienta_id: string;
  bodega_id: string;
  cantidad: number;
}

export interface Auditoria {
  id: string;
  tabla: string;
  registro_id: string | null;
  accion: string;
  usuario_email: string | null;
  descripcion: string | null;
  fecha: string;
}
