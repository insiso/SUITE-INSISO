# CONTEXTO — Producto SaaS (Insiso SpA)

> Documento de arranque del **chat del PRODUCTO SaaS**. Empieza leyendo esto + `PLAN_PRODUCTO_SAAS.md`
> y `BLUEPRINT_FINANZAS.md`.
> Esta carpeta es una **COPIA (fork)** del ERP de Fapama, para construir el producto multiempresa
> SIN tocar el sistema en producción de Fapama.
> Actualizado: 2026-09-02.

## Qué es este proyecto
El ERP de construcción convertido en **SaaS multiempresa** (la "Suite INSISO"), vendido por Insiso SpA
con marca de producto propia (a definir). Módulos: **Logística** (el ERP base), **Finanzas** (nuevo,
ver BLUEPRINT_FINANZAS.md) y **Personas** (futuro).

## Regla de oro (no mezclar)
- **Esta carpeta (`SaaS-Insiso/`) = PRODUCTO.** Aquí se construye lo multiempresa.
- **La carpeta `ERP FAPAMA Ing y Construción SpA/` = CLIENTE FAPAMA en producción.** NO se toca desde aquí.
- Este chat trabaja SOLO en esta carpeta. El chat de Fapama trabaja SOLO en la suya.

## ✅ ESTADO ACTUAL (2026-09-02): BASE DE DATOS INSTALADA EN PRODUCCIÓN
- **Supabase del producto CREADO**: proyecto "INSISO Project", ref `ofxtqkxwkumyzazgayem`,
  cuenta contacto.insiso@gmail.com. URL: https://ofxtqkxwkumyzazgayem.supabase.co
- **Esquema completo aplicado y verificado** (35 objetos): todo el ERP Logística (instalacion_completa +
  04 + parches, incluida la tabla `movimientos_herramientas` reconstruida) + base multiempresa
  (05: `empresas`, `mi_empresa()`, `aplicar_rls_empresa()`) + **módulo Finanzas completo**
  (06: `cuentas`, `comprobantes`, `lineas_comprobante`, `periodos`, `documentos_rcv`,
  `centros_costo`, `presupuestos_finanzas`, vistas libro mayor/balance, triggers de cuadratura,
  período cerrado y cuentas imputables).
- ⚠️ **Renombre importante**: la tabla de presupuestos contables es **`presupuestos_finanzas`**
  (`presupuestos` a secas sigue siendo la de obra del ERP Logística).
- **Primera empresa (tenant)**: INSISO SpA (rut 78.469.358-9) con el plan de cuentas chileno
  de 36 cuentas ya cargado (`crear_plan_cuentas_base`).
- Las 5 vistas del ERP quedaron con `security_invoker = true` (Security Advisor limpio).
- Script maestro usado: `supabase/EJECUTAR_EN_SQL_EDITOR.sql` (v4, idempotente).
- Credenciales: ver `env-local-LISTO.txt` → **renombrar a `.env.local`** y pegar la
  `SUPABASE_SERVICE_ROLE_KEY` desde el dashboard (Project Settings → API Keys).

## Primeros pasos del CÓDIGO (siguiente sesión de este chat)
1. Renombrar `env-local-LISTO.txt` → `.env.local` y completar la service_role key.
2. `npm install` + `npm run dev` → probar login contra el Supabase nuevo (el trigger
   handle_new_user crea el perfil; el primer usuario registrado queda Administrador).
3. **Fase multiempresa del módulo Logística**: agregar `empresa_id` a las tablas del ERP
   (proyectos, materiales, bodegas, inventario_stock, movimientos_kardex, herramientas,
   proveedores, facturas, usuarios…) con backfill a la empresa INSISO y
   `select aplicar_rls_empresa('<tabla>')` en cada una. Probar con 2 tenants.
4. `usuarios.empresa_id` + ajustar `handle_new_user` para asignar empresa por invitación.
5. Branding dinámico (leer `empresas.marca_nombre/logo/color`) + menú por `modulos_activos`.
6. Frontend del módulo Finanzas según `BLUEPRINT_FINANZAS.md` y el prototipo
   `Prototipos/insiso-finanzas.html` (referencia visual).
7. GitHub (repo privado "suite-insiso") + Vercel proyecto NUEVO (no reusar el de Fapama):
   `unset VERCEL_TOKEN && npx -y vercel@58.7.1`, luego `--prod`.

## Infraestructura restante (ver Guía de Infraestructura en Documentacion Word)
- **Resend** (correos de la app): cuenta con contacto.insiso@gmail.com, verificar dominio
  insiso.cl (DNS en Cloudflare), SMTP en Supabase Auth (smtp.resend.com:465, user `resend`,
  remitente suite@insiso.cl). Free: 3.000 correos/mes.
- **Dominio de la app**: suite.insiso.cl (CNAME en Cloudflare cuando exista el Vercel).
- Antes del primer cliente pagado: Supabase Pro (~USD 25/mes) + respaldos.

## Origen
Fork tomado del ERP Fapama el 2026-08-27. Historia y detalle técnico del sistema base:
ver `CONTEXTO_PROYECTO.md` en la carpeta de Fapama.
