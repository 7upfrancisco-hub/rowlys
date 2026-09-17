import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireTenantId } from "@/lib/tenant";
import type { CouponStatus } from "@/types";

export const dynamic = "force-dynamic";

// Calculado en el server, no es un campo propio de Coupon: activo/inactivo lo
// decide el local a mano, pero "expirado" y "agotado" dependen de la fecha y
// de cuánto se lleva descontado (todavía siempre 0 — ver nota del schema).
function computeStatus(coupon: {
  active: boolean;
  expiresAt: Date | null;
  budgetCap: number | null;
  totalDiscounted: number;
}): CouponStatus {
  if (!coupon.active) return "INACTIVE";
  if (coupon.expiresAt && coupon.expiresAt.getTime() < Date.now()) return "EXPIRED";
  if (coupon.budgetCap != null && coupon.totalDiscounted >= coupon.budgetCap) {
    return "EXHAUSTED";
  }
  return "ACTIVE";
}

export async function GET(request: Request) {
  const tenantId = requireTenantId(request);
  const coupons = await prisma.coupon.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
    include: { redemptions: { select: { discountAmount: true } } },
  });

  return NextResponse.json(
    coupons.map(({ redemptions, ...coupon }) => {
      const totalDiscounted = redemptions.reduce((s, r) => s + r.discountAmount, 0);
      return {
        ...coupon,
        redemptionsCount: redemptions.length,
        totalDiscounted,
        status: computeStatus({ ...coupon, totalDiscounted }),
      };
    })
  );
}

const createCouponSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(1, "Falta el código.")
      .transform((s) => s.toUpperCase()),
    discountType: z.enum(["PERCENT", "FIXED"]),
    discountValue: z.number().positive("El valor tiene que ser mayor a 0."),
    budgetCap: z.number().positive().optional(),
    active: z.boolean().optional(),
    expiresAt: z
      .string()
      .trim()
      .refine((s) => s === "" || !isNaN(Date.parse(s)), "Fecha de vencimiento inválida.")
      .optional(),
  })
  .refine((d) => d.discountType !== "PERCENT" || d.discountValue <= 100, {
    message: "Un descuento porcentual no puede superar el 100%.",
    path: ["discountValue"],
  });

export async function POST(request: Request) {
  const tenantId = requireTenantId(request);
  const parsed = createCouponSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Datos inválidos." },
      { status: 400 }
    );
  }
  const { expiresAt, ...rest } = parsed.data;

  const existing = await prisma.coupon.findFirst({ where: { code: rest.code, tenantId } });
  if (existing) {
    return NextResponse.json(
      { error: `Ya existe un cupón con el código "${rest.code}".` },
      { status: 409 }
    );
  }

  const coupon = await prisma.coupon.create({
    data: { ...rest, expiresAt: expiresAt ? new Date(expiresAt) : undefined, tenantId },
  });
  return NextResponse.json(
    { ...coupon, redemptionsCount: 0, totalDiscounted: 0, status: computeStatus({ ...coupon, totalDiscounted: 0 }) },
    { status: 201 }
  );
}
