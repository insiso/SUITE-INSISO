# Cómo manejar los 2 proyectos sin mezclarlos

Tienes dos caminos que avanzan en paralelo. La clave: **cada uno con su carpeta, su
base de datos, su Vercel y su chat.**

## Los dos proyectos
| | **ERP Fapama (mantención)** | **SaaS Insiso (producto)** |
|---|---|---|
| Para qué | Operar y arreglar el sistema que Fapama usa hoy | Construir el producto multiempresa para vender |
| Carpeta | `~/Desktop/FAPAMA/ERP FAPAMA Ing y Construción SpA/` | `~/Desktop/FAPAMA/SaaS-Insiso/` |
| Base | Supabase de Fapama (producción, no experimentar) | Supabase NUEVO (aparte) |
| Vercel | `erp-fapama` (producción) | Proyecto nuevo del producto |
| Doc de arranque | `CONTEXTO_PROYECTO.md` | `CONTEXTO_SAAS_INICISO.md` + `PLAN_PRODUCTO_SAAS.md` |

## Cómo abrir cada chat (paso a paso)
1. **Nuevo chat en Cowork** (idealmente un **proyecto/espacio de Cowork distinto** para cada uno,
   así la memoria no se mezcla).
2. **Conecta SOLO la carpeta que corresponde** a ese chat (no ambas):
   - Chat Fapama → conecta `ERP FAPAMA Ing y Construción SpA/`.
   - Chat SaaS → conecta `SaaS-Insiso/`.
3. **Primer mensaje sugerido:**
   - Fapama: *"Este es el chat de mantención del ERP Fapama. Lee `CONTEXTO_PROYECTO.md` y sigamos con la operación/arreglos del sistema en producción. No toques el producto SaaS."*
   - SaaS: *"Este es el chat del producto SaaS de Insiso. Lee `CONTEXTO_SAAS_INICISO.md` y `PLAN_PRODUCTO_SAAS.md`. Partamos por la Fase 1 (multiempresa)."*

## Reglas para no confundirse
- **Nunca** trabajar en las dos carpetas desde el mismo chat.
- Fapama = producción → cambios chicos y probados. SaaS = laboratorio → aquí se experimenta.
- Como el SaaS es una **copia** del código de Fapama: si en Fapama arreglas un bug importante,
  avisa para portarlo también al SaaS (y viceversa) hasta que converjan.
- Meta final: cuando el SaaS esté multiempresa y estable, **Fapama se migra como un cliente más**
  del SaaS y se jubila la carpeta/Vercel viejos. Ahí deja de haber dos códigos.

## Memoria compartida (importante)
La memoria de Cowork puede compartirse entre chats del mismo espacio. Para evitar cruces,
lo ideal es tener **un espacio/proyecto de Cowork separado por cada uno**. Si quedan en el mismo,
las notas se rotulan claramente "Fapama" vs "Insiso/SaaS".
