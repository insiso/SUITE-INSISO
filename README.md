# ERP FAPAMA · Ing y Construcción SpA

ERP empresarial para **Gestión de Proyectos, Inventario Multi-Bodega y Control de Presupuestos**, inspirado en las mejores prácticas de SAP (módulos MM/PS) e iConstruye.

Construido con **Next.js (App Router) + TypeScript + Tailwind CSS + Supabase (PostgreSQL)**. Toda la interfaz está en español.

---

## 📦 Módulos incluidos

| Módulo | Descripción |
|---|---|
| **Dashboard** | KPIs de presupuesto vs. gasto real, alertas de stock, proyectos activos y devoluciones pendientes. Gráficos interactivos (Recharts). |
| **Proyectos y Presupuestos** (SAP PS) | Proyectos con presupuesto desglosado por categoría y seguimiento de desviaciones en tiempo real. |
| **Materiales** (SAP MM) | Catálogo maestro: SKU, unidad de medida, precio y stock mínimo. |
| **Bodegas** | Soporte multi-bodega (central, de proyecto, virtual, tránsito). |
| **Inventario** | Matriz de stock por bodega con alertas de stock mínimo. |
| **Movimientos / Kardex** | Entradas, salidas y traspasos con registro transaccional estricto. El stock se actualiza automáticamente vía triggers. |
| **Herramientas y Equipos** | Control de activos con flujo de préstamo (checkout) y devolución (check-in). |

---

## 🚀 Puesta en marcha

### Requisitos previos

- **Node.js 18.18 o superior** (recomendado 20 LTS). Verifica con `node --version`.
  - Si no tienes Node: instálalo desde <https://nodejs.org> o con `nvm install 20`.
- Una cuenta gratuita en **[Supabase](https://supabase.com)**.

### Paso 1 — Instalar dependencias

```bash
npm install
```

### Paso 2 — Crear el proyecto en Supabase y cargar el esquema

1. Crea un proyecto nuevo en <https://supabase.com>.
2. Ve a **SQL Editor → New query**.
3. Copia y pega **todo** el contenido de [`supabase/schema.sql`](supabase/schema.sql) y pulsa **Run**.
   - El script crea las tablas, triggers, vistas, políticas de seguridad (RLS) y **datos de ejemplo** para ver el sistema funcionando de inmediato.
   - Es idempotente: puedes ejecutarlo más de una vez sin error.

### Paso 3 — Configurar las credenciales

1. En Supabase ve a **Project Settings → API**.
2. Copia el archivo de ejemplo y complétalo:

   ```bash
   cp .env.local.example .env.local
   ```

3. Edita `.env.local` con tus valores:

   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...
   ```

### Paso 4 — Ejecutar en local

```bash
npm run dev
```

Abre <http://localhost:3000>. La app redirige al **Dashboard**.

> El indicador de la barra superior muestra **«Base conectada»** (verde) cuando las credenciales están correctas, o **«Configurar BD»** (ámbar) si falta el `.env.local`.

---

## 🏗️ Arquitectura

```
src/
├── app/                      # Rutas (App Router)
│   ├── layout.tsx            # Layout raíz (sidebar + topbar + toasts)
│   ├── dashboard/            # Control de gestión + gráficos
│   ├── proyectos/            # Listado y detalle [id] con presupuestos
│   ├── materiales/           # Catálogo maestro (CRUD)
│   ├── bodegas/              # Multi-bodega (CRUD)
│   ├── inventario/           # Matriz de stock
│   ├── movimientos/          # Kardex (entradas/salidas/traspasos)
│   └── herramientas/         # Préstamo y devolución
├── components/
│   ├── layout/               # Sidebar, topbar, app-shell
│   ├── ui/                   # Componentes base (card, button, modal, tabla…)
│   └── dashboard/charts.tsx  # Gráficos Recharts
└── lib/
    ├── supabase/client.ts    # Cliente de Supabase (navegador)
    ├── types.ts              # Tipos de dominio
    ├── constants.ts          # Catálogos y mapas de color
    ├── hooks.ts              # useConsulta (loading/error/refetch)
    └── utils.ts              # Formateadores (CLP, fechas, %)
supabase/schema.sql           # Esquema completo de la base de datos
```

### Lógica de negocio en la base de datos

- **Stock automático:** un trigger en `movimientos_kardex` actualiza `inventario_stock` (suma al destino / descuenta del origen) según el tipo de movimiento.
- **Estado de herramientas:** un trigger sincroniza el estado de la herramienta con sus préstamos (PRESTADA / DISPONIBLE).
- **Vistas de analítica:** `vista_inventario`, `vista_stock_total`, `vista_gasto_real`, `vista_desviacion_presupuesto` y `vista_resumen_proyectos` alimentan el dashboard y los reportes.
- **Auditoría:** todas las tablas tienen `created_at` / `updated_at` (este último mantenido por trigger).

---

## 🔒 Seguridad (importante para producción)

El esquema habilita **Row Level Security (RLS)** en todas las tablas, pero con **políticas permisivas de desarrollo** (acceso con la clave `anon`). Antes de pasar a producción:

1. Implementa autenticación con **Supabase Auth**.
2. Reemplaza las políticas `acceso_dev_*` por políticas basadas en `auth.uid()` y el rol del usuario (tabla `usuarios`).
3. Considera mover operaciones sensibles a Server Actions / Route Handlers con la `service_role`.

---

## 📜 Scripts

| Comando | Acción |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Compilación de producción |
| `npm run start` | Servir la build de producción |

---

© FAPAMA Ing y Construcción SpA — ERP v1.0
