import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Público (sin auth): reglas de descuento automático activas, para que el
// checkout pueda previsualizar el total antes de confirmar. No expone nada
// sensible (mismos datos que ya se ven en /admin/descuentos). El pedido real
// siempre se recalcula server-side en createOrder — esto es solo preview.
export async function GET() {
  // El checkout público todavía no manda tenantId (Fase 26b-3 pendiente), así
  // que se resuelve igual que en `createOrder`: el tenant dueño de la fila
  // "singleton" de Settings. Sin esto, reglas activas de OTRO tenant (ya hay
  // un segundo, "Pizzería Demo") se colaban acá sin filtro alguno y el
  // preview no coincidía con lo que createOrder termina cobrando.
  const settings = await prisma.settings.findUnique({ where: { id: "singleton" } });
  const discounts = await prisma.discount.findMany({
    where: { active: true, ...(settings?.tenantId ? { tenantId: settings.tenantId } : {}) },
    // Mismo orderBy que `createOrder` (src/lib/orders.ts): sin esto, cuál
    // regla "gana" entre dos activas sobre el mismo producto podía variar
    // entre el preview y el cobro real.
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      kind: true,
      title: true,
      active: true,
      target: true,
      productId: true,
      categoryId: true,
      valueType: true,
      value: true,
      triggerProductId: true,
      rewardProductId: true,
      paymentProvider: true,
    },
  });
  return NextResponse.json(discounts);
}
