import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { resolveItems, type ItemInput } from "@/lib/orders";
import { priceCoupon } from "@/lib/coupons";
import { priceAutomaticDiscounts } from "@/lib/discount-pricing";
import { resolveTenantBySlug } from "@/lib/public-tenant";

export const dynamic = "force-dynamic";

// Público (sin auth, mismo criterio que `POST /api/<tenant>/orders`): preview
// del descuento ANTES de pagar, para mostrarlo en el checkout. No cobra nada —
// `createOrder` vuelve a validar y cotizar el cupón de cero al confirmar
// (con los descuentos automáticos ya aplicados, mismo orden que acá), así
// que esta ruta es solo para la experiencia, nunca la fuente de verdad.
const validateSchema = z.object({
  code: z.string().trim().min(1),
  phone: z.string().trim().min(1),
  orderType: z.enum(["PICKUP", "DELIVERY"]),
  paymentMethod: z.enum(["CASH", "MP", "BANK_TRANSFER"]),
  items: z
    .array(
      z.object({
        productId: z.string(),
        quantity: z.number().int().positive(),
        optionIds: z.array(z.string()).optional(),
      })
    )
    .min(1),
});

export async function POST(
  request: Request,
  { params }: { params: { tenant: string } }
) {
  const tenant = await resolveTenantBySlug(params.tenant);
  if (!tenant) {
    return NextResponse.json({ error: "Local no encontrado." }, { status: 404 });
  }

  const parsed = validateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Datos inválidos." },
      { status: 400 }
    );
  }
  const { code, phone, orderType, paymentMethod, items } = parsed.data;

  const resolved = await resolveItems(items as ItemInput[], orderType, tenant.id);
  if (!resolved.ok) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }

  // Mismo orderBy que `createOrder` (src/lib/orders.ts): sin esto, cuál
  // regla "gana" entre dos activas sobre el mismo producto podía variar
  // entre el preview y el cobro real.
  const discountRules = await prisma.discount.findMany({
    where: { active: true, tenantId: tenant.id },
    orderBy: { createdAt: "asc" },
  });
  const automatic = priceAutomaticDiscounts(
    resolved.pricingLines,
    orderType,
    paymentMethod,
    0,
    discountRules
  );

  const priced = await priceCoupon(code, phone, automatic.itemsTotal, tenant.id);
  if (!priced.ok) {
    return NextResponse.json({ error: priced.error }, { status: priced.status });
  }

  return NextResponse.json({
    code: priced.coupon.code,
    discountAmount: priced.discountAmount,
  });
}
