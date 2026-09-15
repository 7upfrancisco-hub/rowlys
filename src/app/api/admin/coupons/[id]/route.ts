import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireTenantId } from "@/lib/tenant";

export const dynamic = "force-dynamic";

const updateCouponSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(1)
      .transform((s) => s.toUpperCase())
      .optional(),
    discountType: z.enum(["PERCENT", "FIXED"]).optional(),
    discountValue: z.number().positive().optional(),
    budgetCap: z.number().positive().nullable().optional(),
    active: z.boolean().optional(),
    expiresAt: z
      .string()
      .trim()
      .refine((s) => s === "" || !isNaN(Date.parse(s)), "Fecha de vencimiento inválida.")
      .nullable()
      .optional(),
  })
  .refine((d) => Object.keys(d).length > 0, {
    message: "No hay nada para actualizar.",
  })
  .refine(
    (d) =>
      d.discountType !== "PERCENT" || d.discountValue == null || d.discountValue <= 100,
    { message: "Un descuento porcentual no puede superar el 100%.", path: ["discountValue"] }
  );

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const tenantId = requireTenantId(request);
  const parsed = updateCouponSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Datos inválidos." },
      { status: 400 }
    );
  }

  const existing = await prisma.coupon.findFirst({ where: { id: params.id, tenantId } });
  if (!existing) {
    return NextResponse.json({ error: "El cupón no existe." }, { status: 404 });
  }

  const { expiresAt, ...rest } = parsed.data;
  if (rest.code && rest.code !== existing.code) {
    const clash = await prisma.coupon.findUnique({ where: { code: rest.code } });
    if (clash) {
      return NextResponse.json(
        { error: `Ya existe un cupón con el código "${rest.code}".` },
        { status: 409 }
      );
    }
  }

  const coupon = await prisma.coupon.update({
    where: { id: params.id },
    data: {
      ...rest,
      ...(expiresAt !== undefined
        ? { expiresAt: expiresAt ? new Date(expiresAt) : null }
        : {}),
    },
  });
  return NextResponse.json(coupon);
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  const tenantId = requireTenantId(request);
  const existing = await prisma.coupon.findFirst({ where: { id: params.id, tenantId } });
  if (!existing) {
    return NextResponse.json({ error: "El cupón no existe." }, { status: 404 });
  }
  await prisma.coupon.delete({ where: { id: params.id } });
  return new NextResponse(null, { status: 204 });
}
