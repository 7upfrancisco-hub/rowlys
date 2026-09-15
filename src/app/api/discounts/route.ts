import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Público (sin auth): reglas de descuento automático activas, para que el
// checkout pueda previsualizar el total antes de confirmar. No expone nada
// sensible (mismos datos que ya se ven en /admin/descuentos). El pedido real
// siempre se recalcula server-side en createOrder — esto es solo preview.
export async function GET() {
  const discounts = await prisma.discount.findMany({
    where: { active: true },
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
