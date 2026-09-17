import type { Coupon } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizeArPhone } from "@/lib/phone";

// Lógica compartida para aplicar un cupón, usada tanto por el endpoint de
// preview (`POST /api/coupons/validate`, para mostrar el descuento antes de
// pagar) como por `createOrder` (que es quien de verdad cobra). Ninguna de
// las dos rutas confía en un monto que mande el cliente: `itemsTotal` viene
// siempre de `resolveItems`, recalculado contra la base.
//
// Regla de uso (decidida por el usuario): sin tope global de usos — cada
// cliente (identificado por teléfono normalizado) puede usar un cupón una
// sola vez, controlado con la restricción única de `CouponRedemption`.
// `budgetCap` es un techo opcional de $ ya descontados en total; una vez
// alcanzado, el cupón deja de aplicarse aunque siga "activo".

export type CouponPricingResult =
  | { ok: true; coupon: Coupon; phoneKey: string; discountAmount: number }
  | { ok: false; status: number; error: string };

export async function priceCoupon(
  rawCode: string,
  rawPhone: string,
  itemsTotal: number,
  tenantId: string
): Promise<CouponPricingResult> {
  const code = rawCode.trim().toUpperCase();
  if (!code) {
    return { ok: false, status: 400, error: "Falta el código del cupón." };
  }

  const phoneKey = normalizeArPhone(rawPhone);
  if (!phoneKey) {
    return {
      ok: false,
      status: 400,
      error: "Para usar un cupón hace falta un teléfono válido.",
    };
  }

  const coupon = await prisma.coupon.findFirst({ where: { code, tenantId } });
  if (!coupon) {
    return { ok: false, status: 404, error: "Ese cupón no existe." };
  }
  if (!coupon.active) {
    return { ok: false, status: 400, error: "Ese cupón ya no está activo." };
  }
  if (coupon.expiresAt && coupon.expiresAt.getTime() < Date.now()) {
    return { ok: false, status: 400, error: "Ese cupón venció." };
  }

  if (coupon.budgetCap != null) {
    const usedAgg = await prisma.couponRedemption.aggregate({
      where: { couponId: coupon.id },
      _sum: { discountAmount: true },
    });
    const used = usedAgg._sum.discountAmount ?? 0;
    if (used >= coupon.budgetCap) {
      return { ok: false, status: 400, error: "Ese cupón se quedó sin presupuesto." };
    }
  }

  const alreadyUsed = await prisma.couponRedemption.findUnique({
    where: { couponId_customerPhone: { couponId: coupon.id, customerPhone: phoneKey } },
  });
  if (alreadyUsed) {
    return { ok: false, status: 400, error: "Ya usaste ese cupón antes." };
  }

  const rawDiscount =
    coupon.discountType === "PERCENT"
      ? itemsTotal * (coupon.discountValue / 100)
      : coupon.discountValue;
  // Nunca descuenta más que el subtotal de productos (no toca el envío) ni
  // deja el pedido en $0.
  const discountAmount = Math.round(Math.min(rawDiscount, itemsTotal) * 100) / 100;

  return { ok: true, coupon, phoneKey, discountAmount };
}
