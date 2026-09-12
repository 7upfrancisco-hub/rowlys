import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// "Pedidos fantasma": un cliente eligió pagar con Mercado Pago (o transferencia
// vía MP), nunca completó el pago y el pedido quedó en PENDING, oculto para la
// cocina (ver el filtro de GET /api/orders). Si se acumulan, ensucian métricas y
// el historial. Pasado un tiempo se cancelan solos.
//
// Server-only.

// Antigüedad a partir de la cual un pedido MP sin pagar se considera abandonado.
// También es el tiempo de expiración de la preferencia de MP (ver
// createPreference): después de esta ventana el cliente ya no puede pagar, así
// que cancelar es seguro. Si igual entra un pago tardío, el webhook revive el
// pedido (ver /api/webhooks/mercadopago).
export const PHANTOM_ORDER_HOURS = 3;

export const PHANTOM_CANCEL_REASON =
  "Pago no confirmado — cancelado automáticamente";

function cutoff(): Date {
  return new Date(Date.now() - PHANTOM_ORDER_HOURS * 60 * 60 * 1000);
}

// Filtro base: pedido sin aceptar, con pago MP que no se confirmó.
const UNPAID_MP: Prisma.OrderWhereInput = {
  status: "PENDING",
  payment: { provider: "MP", status: { not: "CONFIRMED" } },
};

// Cancela los pedidos MP sin pagar de más de PHANTOM_ORDER_HOURS. Idempotente.
// Devuelve cuántos canceló. `tenantId` acota el barrido a un local (siempre
// se pasa desde rutas protegidas, Fase 26b); sin él barre todos los tenants —
// lo sigue usando el checkout público, que todavía no resuelve tenant.
export async function sweepPhantomOrders(tenantId?: string): Promise<number> {
  const { count } = await prisma.order.updateMany({
    where: {
      ...UNPAID_MP,
      createdAt: { lt: cutoff() },
      ...(tenantId ? { tenantId } : {}),
    },
    data: { status: "CANCELLED", cancelReason: PHANTOM_CANCEL_REASON },
  });
  return count;
}

// Para el contador de la UI: cuántos pedidos MP sin pagar hay en total y
// cuántos ya están vencidos (se cancelarían ahora).
export async function countUnpaidOrders(
  tenantId?: string
): Promise<{ pending: number; stale: number }> {
  const where = tenantId ? { ...UNPAID_MP, tenantId } : UNPAID_MP;
  const [pending, stale] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.count({
      where: { ...where, createdAt: { lt: cutoff() } },
    }),
  ]);
  return { pending, stale };
}
