import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { OrderStatus } from "@/types";

export const dynamic = "force-dynamic";

// Inicio del día actual en horario de Argentina (UTC-3, sin horario de verano).
// La medianoche de Argentina son las 03:00 UTC.
function argentinaDayStart(): Date {
  const now = new Date();
  const art = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  return new Date(
    Date.UTC(art.getUTCFullYear(), art.getUTCMonth(), art.getUTCDate(), 3, 0, 0)
  );
}

// Métricas del día para la barra de /comanda. "Hoy" = desde la medianoche de
// Argentina. Se calcula en memoria (un día son pocas filas).
export async function GET() {
  const dayStart = argentinaDayStart();

  const orders = await prisma.order.findMany({
    where: { createdAt: { gte: dayStart } },
    select: {
      status: true,
      total: true,
      payment: { select: { provider: true, status: true } },
    },
  });

  const byStatus: Record<OrderStatus, number> = {
    PENDING: 0,
    CONFIRMED: 0,
    IN_PROGRESS: 0,
    READY: 0,
    DELIVERED: 0,
    CANCELLED: 0,
  };

  let orderCount = 0;
  let revenue = 0;
  let cashPending = 0;

  for (const o of orders) {
    byStatus[o.status]++;
    if (o.status === "CANCELLED") continue;
    orderCount++;
    revenue += o.total;
    const manualPayment =
      o.payment?.provider === "CASH" || o.payment?.provider === "BANK_TRANSFER";
    if (manualPayment && o.payment?.status !== "CONFIRMED") {
      cashPending += o.total;
    }
  }

  return NextResponse.json({
    dayStart: dayStart.toISOString(),
    orders: orderCount,
    revenue,
    cashPending,
    byStatus,
  });
}
