import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveItems, type ItemInput } from "@/lib/orders";
import { priceCoupon } from "@/lib/coupons";

export const dynamic = "force-dynamic";

// Público (sin auth, mismo criterio que `POST /api/orders`): preview del
// descuento ANTES de pagar, para mostrarlo en el checkout. No cobra nada —
// `createOrder` vuelve a validar y cotizar el cupón de cero al confirmar, así
// que esta ruta es solo para la experiencia, nunca la fuente de verdad.
const validateSchema = z.object({
  code: z.string().trim().min(1),
  phone: z.string().trim().min(1),
  orderType: z.enum(["PICKUP", "DELIVERY"]),
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

export async function POST(request: Request) {
  const parsed = validateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Datos inválidos." },
      { status: 400 }
    );
  }
  const { code, phone, orderType, items } = parsed.data;

  const resolved = await resolveItems(items as ItemInput[], orderType);
  if (!resolved.ok) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }

  const priced = await priceCoupon(code, phone, resolved.itemsTotal);
  if (!priced.ok) {
    return NextResponse.json({ error: priced.error }, { status: priced.status });
  }

  return NextResponse.json({
    code: priced.coupon.code,
    discountAmount: priced.discountAmount,
  });
}
