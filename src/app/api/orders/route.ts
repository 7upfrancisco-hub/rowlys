import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { sweepPhantomOrders } from "@/lib/phantom-orders";
import { requireTenantId } from "@/lib/tenant";

export const dynamic = "force-dynamic";

// Barrido oportunista de pedidos MP abandonados. La comanda consulta este
// endpoint cada 5s, así que con este throttle el barrido corre ~cada 10 min sin
// necesidad de un cron. No bloquea la respuesta.
//
// El throttle es POR TENANT (Map), no una única variable global: en el
// deploy multi-tenant, si fuera un solo timestamp compartido, el barrido de
// un tenant podía "robarle" el turno al de otro (el primero que pasa los 10
// min resetea el reloj para todos), dejando los pedidos fantasma de los
// demás locales sin barrer mucho más tiempo del previsto.
const SWEEP_EVERY_MS = 10 * 60 * 1000;
const lastSweepAtByTenant = new Map<string, number>();

function maybeSweepPhantomOrders(tenantId: string) {
  const now = Date.now();
  const lastSweepAt = lastSweepAtByTenant.get(tenantId) ?? 0;
  if (now - lastSweepAt < SWEEP_EVERY_MS) return;
  lastSweepAtByTenant.set(tenantId, now);
  sweepPhantomOrders(tenantId)
    .then((n) => {
      if (n > 0) console.log(`Pedidos fantasma cancelados: ${n}`);
    })
    .catch((err) => console.error("Barrido de pedidos fantasma falló:", err));
}

const orderStatusSchema = z.enum([
  "PENDING",
  "CONFIRMED",
  "IN_PROGRESS",
  "READY",
  "DELIVERED",
  "CANCELLED",
]);

export async function GET(request: Request) {
  const tenantId = requireTenantId(request);
  maybeSweepPhantomOrders(tenantId);

  const { searchParams } = new URL(request.url);
  const statusParam = searchParams.get("status");

  let statuses: z.infer<typeof orderStatusSchema>[] | undefined;
  if (statusParam) {
    const parsed = z
      .array(orderStatusSchema)
      .safeParse(statusParam.split(",").map((s) => s.trim()));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Parámetro status inválido." },
        { status: 400 }
      );
    }
    statuses = parsed.data;
  }

  const orders = await prisma.order.findMany({
    where: {
      tenantId,
      status: statuses ? { in: statuses } : { notIn: ["DELIVERED", "CANCELLED"] },
      // Un pedido que se paga con Mercado Pago no llega a la comanda hasta que
      // el webhook confirma el pago. Si el cliente no termina de pagar, queda
      // oculto para la cocina (sigue accesible en /pedido/[id] para reintentar).
      NOT: { payment: { provider: "MP", status: { not: "CONFIRMED" } } },
    },
    include: {
      items: { include: { options: true } },
      payment: true,
      driver: { select: { id: true, name: true, phone: true } },
      couponRedemption: {
        select: { discountAmount: true, coupon: { select: { code: true } } },
      },
      discountApplications: {
        select: { discountId: true, title: true, amount: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(orders);
}
