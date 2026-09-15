import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireTenantId } from "@/lib/tenant";
import {
  assertDiscountOwnership,
  createDiscountSchema,
  discountInclude,
  validateDiscountCrossFields,
} from "@/lib/discounts";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const tenantId = requireTenantId(request);
  const discounts = await prisma.discount.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
    include: discountInclude,
  });
  return NextResponse.json(discounts);
}

export async function POST(request: Request) {
  const tenantId = requireTenantId(request);
  const parsed = createDiscountSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Datos inválidos." },
      { status: 400 }
    );
  }
  const data = parsed.data;

  const crossError = validateDiscountCrossFields(data);
  if (crossError) return NextResponse.json({ error: crossError }, { status: 400 });

  const ownershipError = await assertDiscountOwnership(data, tenantId);
  if (ownershipError) return NextResponse.json({ error: ownershipError }, { status: 400 });

  const discount = await prisma.discount.create({
    data: {
      kind: data.kind,
      title: data.title,
      active: data.active ?? true,
      tenantId,
      ...(data.kind === "DIRECT" && {
        target: data.target,
        productId: data.target === "PRODUCT" ? data.productId : undefined,
        categoryId: data.target === "CATEGORY" ? data.categoryId : undefined,
        valueType: data.valueType,
        value: data.value,
      }),
      ...(data.kind === "COMBO" && {
        triggerProductId: data.triggerProductId,
        rewardProductId: data.rewardProductId,
        valueType: data.valueType,
        value: data.value,
      }),
      ...(data.kind === "PAYMENT_METHOD" && {
        paymentProvider: data.paymentProvider,
        valueType: data.valueType,
        value: data.value,
      }),
    },
    include: discountInclude,
  });
  return NextResponse.json(discount, { status: 201 });
}
