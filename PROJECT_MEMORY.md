# Rowlys — memoria del proyecto

> Este archivo es la memoria viva del proyecto. Se actualiza a medida que avanza la conversación con Claude: decisiones tomadas, motivos, y estado actual. No es un chat log textual — es un resumen de contexto para que cualquier sesión futura pueda retomar sin perder el hilo.

## Qué es esto

Sistema propio de carta digital + toma de pedidos para el local gastronómico del usuario, inspirado en **app.restosimple.com** (competidor/referencia, no se usa su código ni marca — solo su set de funcionalidades como referencia). Objetivo inicial: reemplazar la dependencia de RestoSimple con un sistema propio. Si el resultado es bueno, el usuario evaluaría venderlo a futuro a otros locales — pero **eso no condiciona el MVP actual**.

## Decisiones de alcance (confirmadas por el usuario)

- **Modalidad de pedido:** take-away (retiro en el local) **y** delivery (envío a domicilio). No es un sistema de mesas/dine-in — el scaffold original que existía en el repo estaba armado para mesas y hay que pivotarlo.
- **Multi-tenant:** NO por ahora. Es para un solo local (el del usuario). Se construye simple; si más adelante se decide vender el producto, se migra a multi-tenant en ese momento, no ahora.
- **Medios de pago** (pensados para poder sumar más a futuro sin rehacer todo):
  - **Efectivo**: contra entrega/retiro. Sin verificación online; el staff lo marca como cobrado manualmente desde el panel.
  - **Mercado Pago**: billetera/tarjetas + el medio "Transferencia" (CVU) del propio Checkout Pro de MP, confirmado automáticamente por webhook.
  - **Modo**: integración de billetera separada, con su propio webhook de confirmación.
  - **Transferencia bancaria con verificación automática**: el usuario pidió que se confirme sola, sin comprobante ni revisión manual. **Restricción técnica real**: no existe forma confiable de verificar automáticamente una transferencia a un alias/CBU cualquiera desde cualquier banco sin un agregador. La solución práctica es que "transferencia" viva **dentro** del checkout de Mercado Pago (medio de pago CVU/transferencia de MP), reusando el mismo webhook de MP — no un módulo aparte de transferencia manual.
- **Admin y panel de cocina (comanda):** necesitan login simple (un solo usuario dueño del local), no pueden quedar públicos.

## Estado del scaffold existente (al 2026-08-26)

Next.js 14 (App Router) + Prisma + SQLite + Tailwind. Ya existía antes de esta conversación, armado para mesas:

- `prisma/schema.prisma`: `Category`, `Product`, `Order` (con `tableNumber`, a reemplazar), `OrderItem`, enum `OrderStatus` (PENDING → IN_PROGRESS → READY → DELIVERED, más CANCELLED).
- `src/app/api/menu/route.ts`: GET categorías + productos.
- `src/app/api/orders/route.ts`: GET/POST de pedidos (validando productos existentes).
- `src/app/page.tsx`: home actual pide "número de mesa" y linkea a `/admin` y `/comanda`, que **todavía no existen** (rutas muertas). Tampoco existe `/menu/[tableNumber]`.
- `src/types/index.ts`: DTOs, `ORDER_STATUS_FLOW`/`ORDER_STATUS_LABELS`, `formatCurrency` en es-AR/ARS — reutilizable.
- `prisma/seed.ts`: datos de ejemplo (4 categorías, 10 productos, precios ARS).
- Sin auth, sin integración de pagos, sin upload de archivos todavía.

## Plan técnico (diseñado 2026-08-26, pendiente de aprobación para empezar a codear)

**Schema Prisma nuevo:**
- `Order`: pierde `tableNumber`; gana `orderType` (PICKUP/DELIVERY), `customerName`, `customerPhone`, `deliveryAddress?`, `deliveryFee`, `total`.
- `Payment` (nuevo, 1:1 con `Order`): `provider` (CASH/MP/MODO), `status` (PENDING/CONFIRMED/FAILED), `amount`, `providerRef`, `rawPayload`. Separado de `Order` a propósito, para poder sumar medios de pago futuros sin volver a migrar `Order`.
- `Settings` (nuevo, fila única): `deliveryFee`, datos del local.
- Se aplica con `prisma db push` (no hay carpeta `migrations` todavía).

**Auth:** sin NextAuth (un solo usuario). `bcryptjs` para el hash de contraseña + `jose` para JWT en cookie httpOnly (compatible con `middleware.ts` en Edge runtime). `middleware.ts` protege `/admin/*` y `/comanda/*`; cada API route de admin revalida server-side también.

**Carrito:** Zustand + `persist` a localStorage (más simple que Context para este caso), usando el `CartLine` que ya existe en `src/types/index.ts`.

**Flujo cliente:** `/menu` → carrito → `/checkout` (elige PICKUP/DELIVERY, datos de contacto, medio de pago) → `POST /api/orders` (recalcula precios/total en servidor, nunca confía en el cliente) crea `Order`+`Payment` en una transacción → según medio: CASH visible enseguida en `/comanda`; MP/MODO recién visibles cuando el webhook confirma el pago (regla de negocio: no mostrar a cocina pedidos no pagados si el medio es billetera/transferencia).

**Pagos:** capa `src/lib/payments/` con interfaz común y un archivo por proveedor (`mercadopago.ts`, `modo.ts`, `cash.ts`) para poder sumar un quinto medio sin tocar `Order`. "Transferencia bancaria" se resuelve **dentro** del Checkout Pro de Mercado Pago (medio CVU/transferencia, mismo webhook que MP wallet) — no hay módulo de transferencia manual aparte, por la restricción técnica ya registrada arriba. Modo tiene su propio webhook; en desarrollo se puede mockear con `MODO_MOCK=true`.

**Webhooks:** `/api/webhooks/mercadopago` (valida `x-signature` con `MP_WEBHOOK_SECRET`, consulta la Payments API de MP, matchea por `external_reference = order.id`, actualiza `Payment.status`) y `/api/webhooks/modo` (mismo patrón).

**Admin:** CRUD de categorías/productos (`/admin/categorias`, `/admin/productos`), pedidos con filtros y "marcar cobrado" para CASH (`/admin/pedidos`), configuración de `deliveryFee` (`/admin/configuracion`).

**Comanda:** listado con polling (SWR, 5s) filtrado por status + regla de visibilidad de pago; botones de avanzar estado reusando `ORDER_STATUS_FLOW`/`ORDER_STATUS_LABELS` ya existentes.

**Fases de implementación sugeridas:**
0. Schema + seed + auth (`db push`, deps nuevas: `bcryptjs`, `jose`, `zustand`, `swr`, `zod`).
1. CRUD admin (categorías, productos, configuración).
2. Flujo cliente solo con efectivo (carrito → checkout → comanda) — ya queda algo demostrable sin integraciones externas.
3. Integración Mercado Pago (incluye transferencia/CVU).
4. Integración Modo.
5. Fuera de alcance ahora: multi-tenant, notificaciones al cliente, websockets.

Archivos críticos a tocar: `prisma/schema.prisma`, `src/app/api/orders/route.ts`, `src/types/index.ts`, `src/lib/prisma.ts`, `src/app/page.tsx` (se simplifica: sin input de mesa, botón directo a `/menu`).

**Pendiente:** revisar este plan con el usuario y confirmar antes de empezar a escribir código (fase 0).

## Historial de decisiones (log)

- **2026-08-26** — Usuario define el proyecto: copiar funcionalidad de app.restosimple.com (carta + comandas) para su propio local, con intención de venderlo después si sale bien.
- **2026-08-26** — Se relevó la landing de app.restosimple.com (sin acceso al sistema real, solo la página pública): menú, comandas, roles mozo/cocina/admin, cobros.
- **2026-08-26** — Se descubrió scaffold preexistente en el repo (Next.js + Prisma + Tailwind, orientado a mesas).
- **2026-08-26** — Usuario define: pedidos take-away + delivery (no mesas); pago con Mercado Pago + Modo + efectivo; transferencia con confirmación automática; single-tenant por ahora.
- **2026-08-26** — Se lanzó agente Plan para diseño técnico detallado (schema, auth, pagos, fases). Resultado pendiente de revisión.
- **2026-08-26** — Plan técnico recibido y volcado en la sección "Plan técnico" de este archivo. Se creó memoria persistente global (fuera del repo) con puntero a este archivo y a las decisiones de alcance. Pendiente: aprobación del usuario para empezar a codear la Fase 0.
