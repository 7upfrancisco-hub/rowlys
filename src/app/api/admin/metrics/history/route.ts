import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import type { OrderStatus, OrderType, PaymentProvider } from "@/types";

export const dynamic = "force-dynamic";

// Argentina es UTC-3 fijo (sin horario de verano). La medianoche de Argentina
// son las 03:00 UTC.
const AR_OFFSET_MS = 3 * 60 * 60 * 1000;

// Medianoche de Argentina para un año/mes/día dados (mes 0-indexado; admite
// desbordes, ej. mes -1 = diciembre del año anterior).
function arMidnight(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month, day, 3, 0, 0));
}

// Año / mes (0-indexado) / día de Argentina para un instante dado.
function arParts(d: Date): { year: number; month: number; day: number } {
  const shifted = new Date(d.getTime() - AR_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
  };
}

function monthKey(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

const MONTH_NAMES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

function monthLabel(year: number, month: number): string {
  return `${MONTH_NAMES[month]} ${year}`;
}

// Un pedido "facturable" es uno que el local aceptó (de CONFIRMED en adelante).
// Deja afuera los PENDING sin aceptar y los CANCELLED. Es el número por el que
// se cobra el servicio (pedidos mensuales).
const BILLABLE: OrderStatus[] = [
  "CONFIRMED",
  "IN_PROGRESS",
  "READY",
  "DELIVERED",
];

type Pair = { orders: number; revenue: number };
const emptyPair = (): Pair => ({ orders: 0, revenue: 0 });

// Métricas de seguimiento e historial para /admin/metricas. Un solo query
// (12 meses de un local = pocas filas) y todo el agregado en memoria.
export async function GET(request: NextRequest) {
  const now = new Date();
  const current = arParts(now);

  // Mes seleccionado (?month=YYYY-MM). Default: mes actual de Argentina.
  const param = request.nextUrl.searchParams.get("month");
  let sy = current.year;
  let sm = current.month;
  if (param) {
    const m = /^(\d{4})-(\d{2})$/.exec(param);
    const mo = m ? Number(m[2]) - 1 : NaN;
    if (!m || mo < 0 || mo > 11) {
      return NextResponse.json({ error: "Mes inválido." }, { status: 400 });
    }
    sy = Number(m[1]);
    sm = mo;
  }

  const selectedEnd = arMidnight(sy, sm + 1, 1);
  // Tabla de historial: 12 meses terminando en el mes seleccionado.
  const historyStart = arMidnight(sy, sm - 11, 1);

  const rows = await prisma.order.findMany({
    where: { createdAt: { gte: historyStart, lt: selectedEnd } },
    select: {
      createdAt: true,
      status: true,
      total: true,
      orderType: true,
      payment: { select: { provider: true } },
    },
  });

  // --- Historial mes a mes: 12 filas fijas, más viejo -> más nuevo ---
  type MonthAgg = { orders: number; revenue: number; cancelled: number };
  const monthOrder: string[] = [];
  const monthIndex = new Map<string, { label: string; agg: MonthAgg }>();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(sy, sm - i, 1));
    const y = d.getUTCFullYear();
    const mo = d.getUTCMonth();
    const key = monthKey(y, mo);
    monthOrder.push(key);
    monthIndex.set(key, {
      label: monthLabel(y, mo),
      agg: { orders: 0, revenue: 0, cancelled: 0 },
    });
  }

  // --- Detalle del mes seleccionado ---
  const daysInMonth = new Date(Date.UTC(sy, sm + 1, 0)).getUTCDate();
  const daily = Array.from({ length: daysInMonth }, (_, i) => ({
    day: i + 1,
    orders: 0,
    revenue: 0,
  }));

  const byChannel: Record<OrderType, Pair> = {
    DELIVERY: emptyPair(),
    PICKUP: emptyPair(),
  };
  const byPayment: Record<PaymentProvider, Pair> = {
    CASH: emptyPair(),
    MP: emptyPair(),
    MODO: emptyPair(),
    BANK_TRANSFER: emptyPair(),
  };

  let billableOrders = 0;
  let revenue = 0;
  let cancelled = 0;
  let pending = 0;

  for (const r of rows) {
    const { year, month, day } = arParts(r.createdAt);
    const billable = BILLABLE.includes(r.status);

    const bucket = monthIndex.get(monthKey(year, month));
    if (bucket) {
      if (billable) {
        bucket.agg.orders++;
        bucket.agg.revenue += r.total;
      } else if (r.status === "CANCELLED") {
        bucket.agg.cancelled++;
      }
    }

    if (year !== sy || month !== sm) continue;

    if (billable) {
      billableOrders++;
      revenue += r.total;
      const d = daily[day - 1];
      if (d) {
        d.orders++;
        d.revenue += r.total;
      }
      byChannel[r.orderType].orders++;
      byChannel[r.orderType].revenue += r.total;
      const prov = r.payment?.provider;
      if (prov && byPayment[prov]) {
        byPayment[prov].orders++;
        byPayment[prov].revenue += r.total;
      }
    } else if (r.status === "CANCELLED") {
      cancelled++;
    } else {
      pending++;
    }
  }

  return NextResponse.json({
    month: monthKey(sy, sm),
    monthLabel: monthLabel(sy, sm),
    isCurrentMonth: sy === current.year && sm === current.month,
    currentMonth: monthKey(current.year, current.month),
    summary: {
      billableOrders,
      revenue,
      avgTicket: billableOrders > 0 ? Math.round(revenue / billableOrders) : 0,
      cancelled,
      pending,
    },
    daily,
    byChannel,
    byPayment,
    monthlyHistory: monthOrder.map((key) => {
      const { label, agg } = monthIndex.get(key)!;
      return {
        month: key,
        label,
        orders: agg.orders,
        revenue: agg.revenue,
        cancelled: agg.cancelled,
        avgTicket: agg.orders > 0 ? Math.round(agg.revenue / agg.orders) : 0,
      };
    }),
  });
}
