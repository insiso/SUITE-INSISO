# BLUEPRINT — Módulo Finanzas de la Suite INSISO

> Documento de arranque para el chat del producto SaaS. Léelo junto con `CONTEXTO_SAAS_INSISO.md`
> y `PLAN_PRODUCTO_SAAS.md`. Versión completa para humanos: `Documentacion Word/Blueprint Suite INSISO - Modulo Finanzas.docx`.
> Fecha: 2026-09-02.

## Decisión estratégica (ya tomada, no volver a preguntar)
- **Suite modular INSISO**: una sola plataforma multiempresa (la del plan SaaS) con módulos activables
  por empresa: **Logística** (el ERP Fapama, ya construido), **Finanzas** (este blueprint) y
  **Personas** (futuro, estilo BUK — blueprint posterior).
- **No se replica SAP completo**: se construye el 20% que las pymes usan, con mejor UX y precio pyme.
- Campo `modulos_activos` en la tabla `empresas` controla qué ve cada cliente en el menú.

## Módulo Finanzas — alcance MVP (fase 1, vendible)
Meta del MVP: *"un contador puede llevar la contabilidad completa de una pyme y declarar su F29 sin salir del sistema"*. Si una feature no aporta a esa frase, no entra.

1. **Plan de cuentas** chileno precargado (árbol 4 niveles, imputables solo hoja) — editable.
2. **Comprobantes** (ingreso/egreso/traspaso): líneas cuenta/centro_costo/debe/haber; trigger que
   impide guardar descuadrado; numeración por tipo; adjuntos de respaldo.
3. **Libro diario, mayor, balance de comprobación** con drill-down al comprobante.
4. **Importación RCV del SII** (CSV oficial de compras y ventas) → centralización automática con IVA.
5. **Propuesta F29**: débito [538], crédito [511], PPM [062], retención honorarios [151]; cuadratura libros vs RCV.
6. **EEFF**: balance clasificado + estado de resultados (motor de clasificación tipo caso C001/FECU).
7. **Centros de costo** básicos + P&L por centro (los proyectos de Logística se crean como centros).
8. **Dashboard financiero** + períodos con bloqueo de cierre.

Fase 2: conciliación bancaria, CxC/CxP con alertas, presupuesto vs real, cierre mensual guiado (wizard).
Fase 3: consolidación multiempresa, DTE propio, moneda extranjera, API, clasificación IA de gastos.

## Tablas núcleo (sobre el esquema multiempresa existente)
`cuentas` (árbol), `comprobantes`, `lineas_comprobante`, `periodos` (bloqueo cierre),
`documentos_rcv`, `centros_costo`, `presupuestos`, `cartolas_banco` — todas con `empresa_id` + RLS `mi_empresa()`.
Integridad en la base: triggers de cuadratura y de período cerrado; auditoría de cambios (patrón kardex Fapama).

## Precios borrador (validar antes de publicar)
Básico $19.900 · Pro $39.900 · Combo Logística+Finanzas $59.900 · Contador multi-cliente (10 empresas) $49.900 — CLP/mes + IVA. Referencias: Nubox ~4 UF paquetes, Defontana $30-40k/mes.

## Orden de ejecución
1. Terminar multiempresa (Fases 1-2 del PLAN_PRODUCTO_SAAS: tabla empresas + RLS, 2 tenants de prueba).
2. Finanzas MVP puntos 1-3 → llevar la contabilidad de INSISO SpA en el propio sistema.
3. RCV + F29 + EEFF → declarar el F29 real de INSISO con la propuesta del sistema.
4. Piloto con contadora experta (mamá del fundador) + 2-3 contadores de su red → primer cliente pagando.
5. Recién ahí: blueprint detallado del módulo Personas (Fase A sin remuneraciones primero).

## Prototipo visual
`Prototipos/insiso-finanzas.html` — prototipo navegable con la UI objetivo (sidebar de módulos,
panel, plan de cuentas, comprobantes, F29, centros, EEFF, cierre guiado). Es la referencia de diseño.
