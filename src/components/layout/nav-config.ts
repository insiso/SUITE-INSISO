import {
  LayoutDashboard,
  FolderKanban,
  Package,
  Warehouse,
  Boxes,
  ArrowLeftRight,
  Wrench,
  Users,
  Building2,
  FileText,
  TrendingDown,
  ScrollText,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  etiqueta: string;
  icono: LucideIcon;
  descripcion: string;
}

export interface NavGrupo {
  titulo: string;
  items: NavItem[];
}

export const NAVEGACION: NavGrupo[] = [
  {
    titulo: "Control de Gestión",
    items: [
      {
        href: "/dashboard",
        etiqueta: "Dashboard",
        icono: LayoutDashboard,
        descripcion: "Indicadores y analítica",
      },
    ],
  },
  {
    titulo: "Datos Maestros",
    items: [
      {
        href: "/materiales",
        etiqueta: "Materiales",
        icono: Package,
        descripcion: "Catálogo maestro",
      },
      {
        href: "/bodegas",
        etiqueta: "Bodegas",
        icono: Warehouse,
        descripcion: "Multi-bodega",
      },
      {
        href: "/inventario",
        etiqueta: "Inventario",
        icono: Boxes,
        descripcion: "Stock por bodega",
      },
    ],
  },
  {
    titulo: "Transacciones",
    items: [
      {
        href: "/movimientos",
        etiqueta: "Movimientos",
        icono: ArrowLeftRight,
        descripcion: "Kardex y traspasos",
      },
      {
        href: "/proyectos",
        etiqueta: "Proyectos",
        icono: FolderKanban,
        descripcion: "Proyectos y presupuestos",
      },
      {
        href: "/herramientas",
        etiqueta: "Herramientas",
        icono: Wrench,
        descripcion: "Préstamo y devolución",
      },
    ],
  },
  {
    titulo: "Abastecimiento",
    items: [
      {
        href: "/proveedores",
        etiqueta: "Proveedores",
        icono: Building2,
        descripcion: "Maestro de proveedores",
      },
      {
        href: "/facturas",
        etiqueta: "Facturas",
        icono: FileText,
        descripcion: "Carga y aprobación",
      },
      {
        href: "/abastecimiento",
        etiqueta: "Comparador de Precios",
        icono: TrendingDown,
        descripcion: "Inteligencia de compras",
      },
    ],
  },
  {
    titulo: "Administración",
    items: [
      {
        href: "/usuarios",
        etiqueta: "Usuarios",
        icono: Users,
        descripcion: "Cuentas y accesos",
      },
      {
        href: "/auditoria",
        etiqueta: "Auditoría",
        icono: ScrollText,
        descripcion: "Bitácora de cambios",
      },
    ],
  },
];
