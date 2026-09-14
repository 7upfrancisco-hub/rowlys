import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { OrderStatus } from "@/types";

export const dynamic = "force-dynamic";

// Mismo criterio de "facturable" y misma cuenta de zona horaria Argentina
// que /api/admin/metrics/history y /api/blend-admin/tenants — duplicado a
// propósito (ver nota en esos archivos), esta rama de rutas es de
// super-admin y no vale la pena acoplarla todavía al resto.
const BILLABLE: OrderStatus[] = ["CONFIRMED", "IN_PROGRESS", "READY", "DELIVERED"];
const AR_OFFSET_MS = 3 * 60 * 60 * 1000;

function arMidnight(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month, day, 3, 0, 0));
}

function arParts(d: Date): { year: number; month: number; day: number } {
  const shifted = new Date(d.getTime() - AR_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
  };
}

// Ventas por día del mes en curso, sumando TODOS los tenants — para el
// gráfico de "cómo viene creciendo Blend" en /blend-admin. A diferencia de
// /api/admin/metrics/history (que es por-tenant), acá no hay `where` de
// tenant: es justamente lo que ve el super-admin y nadie más.
export async function GET() {
  const now = new Date();
  const current = arParts(now);
  const monthStart = arMidnight(current.year, current.month, 1);
  const daysInMonth = new Date(
    Date.UTC(current.year, current.month + 1, 0)
  ).getUTCDate();

  const rows = await prisma.order.findMany({
    where: { createdAt: { gte: monthStart } },
    select: { createdAt: true, status: true, total: true },
  });

  const daily = Array.from({ length: daysInMonth }, (_, i) => ({
    day: i + 1,
    orders: 0,
    revenue: 0,
  }));

  for (const r of rows) {
    if (!BILLABLE.includes(r.status)) continue;
    const { day } = arParts(r.createdAt);
    const d = daily[day - 1];
    if (d) {
      d.orders++;
      d.revenue += r.total;
    }
  }

  const month = `${current.year}-${String(current.month + 1).padStart(2, "0")}`;
  return NextResponse.json({ month, todayDay: current.day, daily });
}
