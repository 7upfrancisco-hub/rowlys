import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireTenantId } from "@/lib/tenant";
import {
  createDiscountSchema,
  discountInclude,
  validateDiscountCrossFields,
} from "@/lib/discounts";

export const dynamic = "force-dynamic";

// Edición = mandar el objeto completo de nuevo (mismo criterio que el form:
// no hay PATCH parcial). Así, si el local cambia de tipo de descuento (ej.
// de Directo a Combo), los campos del tipo anterior se limpian explícito en
// vez de quedar pisados/mezclados.
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
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

  const existing = await prisma.discount.findFirst({ where: { id: params.id, tenantId } });
  if (!existing) {
    return NextResponse.json({ error: "El descuento no existe." }, { status: 404 });
  }

  if (data.kind === "DIRECT" && data.target === "PRODUCT" && data.productId) {
    const p = await prisma.product.findFirst({ where: { id: data.productId, tenantId } });
    if (!p) return NextResponse.json({ error: "Ese producto no existe." }, { status: 400 });
  }
  if (data.kind === "DIRECT" && data.target === "CATEGORY" && data.categoryId) {
    const c = await prisma.category.findFirst({ where: { id: data.categoryId, tenantId } });
    if (!c) return NextResponse.json({ error: "Esa categoría no existe." }, { status: 400 });
  }
  if (data.kind === "COMBO") {
    const [trigger, reward] = await Promise.all([
      prisma.product.findFirst({ where: { id: data.triggerProductId, tenantId } }),
      prisma.product.findFirst({ where: { id: data.rewardProductId, tenantId } }),
    ]);
    if (!trigger || !reward) {
      return NextResponse.json(
        { error: "Alguno de los productos elegidos ya no existe." },
        { status: 400 }
      );
    }
  }

  const discount = await prisma.discount.update({
    where: { id: params.id },
    data: {
      kind: data.kind,
      title: data.title,
      active: data.active ?? true,
      target: data.kind === "DIRECT" ? data.target : null,
      productId: data.kind === "DIRECT" && data.target === "PRODUCT" ? data.productId : null,
      categoryId: data.kind === "DIRECT" && data.target === "CATEGORY" ? data.categoryId : null,
      valueType: data.kind !== "FREE_SHIPPING" ? data.valueType : null,
      value: data.kind !== "FREE_SHIPPING" ? data.value : null,
      triggerProductId: data.kind === "COMBO" ? data.triggerProductId : null,
      rewardProductId: data.kind === "COMBO" ? data.rewardProductId : null,
      paymentProvider: data.kind === "PAYMENT_METHOD" ? data.paymentProvider : null,
    },
    include: discountInclude,
  });
  return NextResponse.json(discount);
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  const tenantId = requireTenantId(request);
  const existing = await prisma.discount.findFirst({ where: { id: params.id, tenantId } });
  if (!existing) {
    return NextResponse.json({ error: "El descuento no existe." }, { status: 404 });
  }
  await prisma.discount.delete({ where: { id: params.id } });
  return new NextResponse(null, { status: 204 });
}
