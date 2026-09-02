# PLAN — Convertir el ERP FAPAMA en un producto SaaS vendible

> Documento de arranque para un chat nuevo. Objetivo: estandarizar el ERP a medida
> y transformarlo en un **SaaS multiempresa** con **marca propia**, vendible a otras
> constructoras. Léelo junto con `CONTEXTO_PROYECTO.md`.
> Fecha: 2026-08-26.

## 0. Decisiones ya tomadas (no volver a preguntar)
- **Modelo:** SaaS multiempresa — una sola app que nosotros hospedamos; cada empresa
  cliente entra a su propio espacio **aislado**. Cobro por suscripción.
- **Marca:** nombre de producto **nuevo** (desligado de "Fapama"), configurable.
- **Alcance del MVP comercial:** los **mismos módulos actuales**.

## 1. Punto de partida (hoy)
- App Next.js 14 + Supabase, en producción (https://erp-fapama.vercel.app), **de una sola
  empresa** (todo asume "Fapama"). Sin `empresa_id`, sin separación por cliente.
- Ya existe un patrón de aislamiento que sirve de modelo: la función `mi_bodega()` +
  políticas RLS `bodega_scope_*` (bodeguero de bodega única). El SaaS replica esa idea
  pero **por empresa** en vez de por bodega.

## 2. Qué significa "estandarizar" (sacar lo específico de Fapama)
El sistema debe volverse **genérico y parametrizable**:
- **Branding por empresa:** nombre, logo, colores → no hardcodear "FAPAMA" ni el logo.
- **Datos semilla vs datos reales:** el inventario/proveedores de Fapama son SUS datos,
  no del producto. Una empresa nueva parte vacía (o con catálogos plantilla opcionales).
- **Textos/constantes:** revisar `src/lib/constants.ts` y componentes por strings "Fapama".
- **Configuración por empresa:** moneda (CLP/UF), segmentos de material, unidades,
  tipos de pago, etc. deben ser configurables, no fijos.

## 3. Arquitectura multiempresa (multi-tenant) sobre Supabase
**Modelo recomendado: base compartida + `empresa_id` + RLS** (una sola base, todas las
empresas dentro, aisladas por fila). Es el estándar SaaS: más barato y fácil de mantener
y actualizar que una base por cliente. El aislamiento lo garantiza RLS (ya probado aquí).

Piezas a construir:
1. **Tabla `empresas`** (el "tenant"): `id, nombre, rut, marca_nombre, logo_url,
   color_primario, plan, activo, created_at`.
2. **Columna `empresa_id`** en **todas** las tablas de negocio (proyectos, materiales,
   bodegas, inventario_stock, movimientos_kardex, herramientas, proveedores, facturas,
   usuarios, etc.). Enumerar exacto con:
   `select table_name from information_schema.tables where table_schema='public';`
3. **`usuarios.empresa_id`**: cada usuario pertenece a una empresa. El trigger
   `on_auth_user_created` debe asignar la empresa (por invitación/registro).
4. **Helper `mi_empresa()`** (SECURITY DEFINER, igual que `mi_bodega()`): devuelve la
   empresa del usuario actual.
5. **RLS por empresa** en cada tabla: `using/with check ( empresa_id = mi_empresa() )`.
   Es la pieza CRÍTICA (un error aquí = una empresa ve datos de otra). Probar a fondo.
6. **Super-admin del SaaS** (nosotros): rol/flag que puede ver todas las empresas
   (para soporte/gestión). Mantener separado del admin de cada empresa.
7. **Branding dinámico:** el layout lee `empresas` del usuario y aplica logo/nombre/color.
8. **Storage:** archivos por empresa con prefijo `empresa_id/...` + policies por empresa.
9. **Onboarding:** alta de empresa + su primer admin + (opcional) catálogos semilla.

## 4. Plan técnico por fases (incremental, sin romper Fapama)
- **Fase 1 — Tenancy base:** crear `empresas`; insertar la empresa "Fapama"; agregar
  `empresa_id` a todas las tablas con default = Fapama y backfill de lo existente.
  (Así Fapama sigue funcionando idéntico.)
- **Fase 2 — Aislamiento RLS:** `mi_empresa()` + políticas por empresa en cada tabla.
  Probar con 2 empresas de prueba que NO se vean entre sí.
- **Fase 3 — Branding y config por empresa:** logo/nombre/color/moneda/segmentos
  configurables; quitar "Fapama" hardcodeado.
- **Fase 4 — Onboarding:** pantalla/asistente para dar de alta una empresa nueva y su
  admin (self-service o asistido por nosotros).
- **Fase 5 — Planes y facturación SaaS:** límites por plan (usuarios/bodegas/proyectos),
  cobro (Flow/Transbank/Stripe), estados de suscripción (activa/morosa/suspendida).
- **Fase 6 — Pulido comercial:** demo con datos de ejemplo, landing, prueba gratis.

## 5. Riesgos clave y mitigación
- **Fuga de datos entre empresas** (el mayor): RLS exhaustiva + pruebas automáticas con
  2 tenants + revisar cada vista `vista_*` (deben filtrar por empresa).
- **Migración del backfill:** hacerlo idempotente y con respaldo previo.
- **Triggers existentes** (stock, on_auth_user_created): revisar que respeten `empresa_id`.
- **Costos:** con varias empresas conviene **Supabase Pro** (Free se pausa) y Vercel Pro.

## 6. Modelo comercial (cómo enlazarla y venderla)
- **Propuesta de valor:** ERP de construcción chileno, a medida, **mucho más barato que
  iConstruye** (referencia: iConstruye ~39,5 UF/mes + ~87 UF implementación).
- **Pricing sugerido (validar):** suscripción mensual por empresa por tramos según
  tamaño (usuarios/proyectos), en CLP o UF. Ej.: Básico / Pro / Empresa. Add-ons futuros
  (ej. facturación electrónica SII/DTE) como módulo aparte.
- **Cómo captar y enlazar clientes:**
  1. Landing con demo y "prueba gratis 14 días" (crea una empresa de prueba).
  2. Onboarding asistido: nosotros creamos su empresa, cargamos sus catálogos, capacitamos.
  3. Contrato SaaS simple (mensual, cancela cuando quiera) + soporte por horas.
  4. Casos de éxito: usar Fapama como cliente ancla/testimonio.
- **Posicionamiento:** "iConstruye a una fracción del precio, hecho en Chile, soporte cercano".

## 7. Marca (nombre nuevo del producto)
Dejar la marca como **configuración** (no hardcode). Criterios: corto, .cl disponible,
evoca construcción/gestión. Candidatos para elegir (verificar dominio/registro):
ObraGestor · ConstruFlow · FaenaPro · ObraLink · MaestroERP · ConstruControl · BodegaObra ·
ObraNube. (En el próximo chat: elegir 1, comprar dominio, definir logo/colores.)

## 8. Legal / operativo
- **Contrato SaaS** y **política de datos** (cada empresa dueña de sus datos; export al salir).
- **Respaldos** automáticos y **SLA** básico de disponibilidad/soporte.
- **SII/DTE**: la facturación electrónica es un módulo especializado; integrar proveedor
  DTE económico como add-on más adelante.
- **Planes de infraestructura:** Supabase Pro + Vercel Pro antes de vender a terceros.

## 9. Checklist accionable para el próximo chat
1. Enumerar todas las tablas de negocio (information_schema) y confirmar cuáles llevan `empresa_id`.
2. Crear tabla `empresas` + insertar "Fapama" + agregar `empresa_id` (backfill a Fapama).
3. Crear `mi_empresa()` + RLS por empresa en cada tabla y vista. Probar con 2 tenants.
4. Ligar `usuarios.empresa_id` + ajustar trigger de alta + flujo de invitación.
5. Branding dinámico por empresa (quitar "Fapama"/logo hardcodeado).
6. Storage por empresa. 7. Onboarding de empresa nueva. 8. Planes/límites + cobro.
9. Landing + demo + prueba gratis. 10. Marca + dominio + contrato SaaS.

## 10. Prompt sugerido para arrancar el próximo chat
> "Vamos a convertir el ERP FAPAMA en un SaaS multiempresa con marca nueva. Lee
> `CONTEXTO_PROYECTO.md` y `PLAN_PRODUCTO_SAAS.md`. Partamos por la Fase 1: crear la
> tabla `empresas`, insertar Fapama y agregar `empresa_id` a todas las tablas con
> backfill, sin romper lo que ya funciona."
