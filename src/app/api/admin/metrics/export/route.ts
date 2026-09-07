import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { toCsv } from "@/lib/csv";
import {
  ORDER_STATUS_LABELS,
  ORDER_TYPE_LABELS,
  PAYMENT_PROVIDER_LABELS,
  type OrderStatus,
} from "@/types";

export const dynamic = "force-dynamic";

// Un pedido "facturable" es uno que el local aceptó (de CONFIRMED en adelante).
// Es el número por el que se cobra el servicio. Mismo criterio que
// /api/admin/metrics/history.
const BILLABLE: OrderStatus[] = [
  "CONFIRMED",
  "IN_PROGRESS",
  "READY",
  "DELIVERED",
];

// Argentina es UTC-3 fijo (sin horario de verano): la medianoche de Argentina
// son las 03:00 UTC.
const AR_OFFSET_MS = 3 * 60 * 60 * 1000;

function arMidnight(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month, day, 3, 0, 0));
}

function arParts(d: Date): { year: number; month: number; day: number } {
  const s = new Date(d.getTime() - AR_OFFSET_MS);
  return {
    year: s.getUTCFullYear(),
    month: s.getUTCMonth(),
    day: s.getUTCDate(),
  };
}

function arDateTime(d: Date): { date: string; time: string } {
  const s = new Date(d.getTime() - AR_OFFSET_MS);
  const dd = String(s.getUTCDate()).padStart(2, "0");
  const mm = String(s.getUTCMonth() + 1).padStart(2, "0");
  const hh = String(s.getUTCHours()).padStart(2, "0");
  const mi = String(s.getUTCMinutes()).padStart(2, "0");
  return { date: `${dd}/${mm}/${s.getUTCFullYear()}`, time: `${hh}:${mi}` };
}

function payStatusLabel(status: string): string {
  if (status === "CONFIRMED") return "Pagado";
  if (status === "FAILED") return "Fallido";
  return "Pendiente";
}

// Exporta a CSV todos los pedidos de un mes (?month=YYYY-MM, default: mes actual
// de Argentina), con una columna "Facturable" para poder auditar el número por
// el que se cobra. Horario de Argentina.
export async function GET(request: NextRequest) {
  const current = arParts(new Date());
  let sy = current.year;
  let sm = current.month;

  const param = request.nextUrl.searchParams.get("month");
  if (param) {
    const m = /^(\d{4})-(\d{2})$/.exec(param);
    const mo = m ? Number(m[2]) - 1 : NaN;
    if (!m || mo < 0 || mo > 11) {
      return NextResponse.json({ error: "Mes inválido." }, { status: 400 });
    }
    sy = Number(m[1]);
    sm = mo;
  }

  const start = arMidnight(sy, sm, 1);
  const end = arMidnight(sy, sm + 1, 1);

  const orders = await prisma.order.findMany({
    where: { createdAt: { gte: start, lt: end } },
    orderBy: { number: "asc" },
    select: {
      number: true,
      createdAt: true,
      status: true,
      orderType: true,
      customerFirstName: true,
      customerLastName: true,
      customerPhone: true,
      customerEmail: true,
      deliveryAddress: true,
      deliveryFee: true,
      total: true,
      payment: { select: { provider: true, status: true } },
    },
  });

  const headers = [
    "Nº",
    "Fecha",
    "Hora",
    "Estado",
    "Facturable",
    "Canal",
    "Cliente",
    "Teléfono",
    "Email",
    "Dirección",
    "Medio de pago",
    "Estado de pago",
    "Subtotal",
    "Envío",
    "Total",
  ];

  const rows = orders.map((o) => {
    const { date, time } = arDateTime(o.createdAt);
    return [
      o.number,
      date,
      time,
      ORDER_STATUS_LABELS[o.status],
      BILLABLE.includes(o.status) ? "Sí" : "No",
      ORDER_TYPE_LABELS[o.orderType],
      `${o.customerFirstName} ${o.customerLastName}`.trim(),
      o.customerPhone,
      o.customerEmail ?? "",
      o.deliveryAddress ?? "",
      o.payment ? PAYMENT_PROVIDER_LABELS[o.payment.provider] : "",
      o.payment ? payStatusLabel(o.payment.status) : "",
      Math.round(o.total - o.deliveryFee),
      Math.round(o.deliveryFee),
      Math.round(o.total),
    ];
  });

  const monthTag = `${sy}-${String(sm + 1).padStart(2, "0")}`;
  return new NextResponse(toCsv(headers, rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="blend-metricas-${monthTag}.csv"`,
    },
  });
}
