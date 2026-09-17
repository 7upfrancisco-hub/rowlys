import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveTenantBySlug } from "@/lib/public-tenant";

export const dynamic = "force-dynamic";

// Público (sin auth): reglas de descuento automático activas, para que el
// checkout pueda previsualizar el total antes de confirmar. No expone nada
// sensible (mismos datos que ya se ven en /admin/descuentos). El pedido real
// siempre se recalcula server-side en createOrder — esto es solo preview.
export async function GET(
  request: Request,
  { params }: { params: { tenant: string } }
) {
  const tenant = await resolveTenantBySlug(params.tenant);
  if (!tenant) {
    return NextResponse.json({ error: "Local no encontrado." }, { status: 404 });
  }

  const discounts = await prisma.discount.findMany({
    where: { active: true, tenantId: tenant.id },
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
