import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireTenantId } from "@/lib/tenant";
import { formatCurrency, type OrderStatus } from "@/types";

export const dynamic = "force-dynamic";

// Reportes de clientes para /admin/metricas → pestaña "Reportes". Mismo
// criterio de "facturable" que el resto de Métricas y que /api/admin/
// customers (total gastado / cantidad de pedidos).
const BILLABLE: OrderStatus[] = [
  "CONFIRMED",
  "IN_PROGRESS",
  "READY",
  "DELIVERED",
];

// Argentina es UTC-3 fijo. Mismo bloque chico que en reports/ventas — se
// duplica a propósito, cada ruta es aislada.
const AR_OFFSET_MS = 3 * 60 * 60 * 1000;

function arParts(d: Date): { year: number; month: number; day: number } {
  const s = new Date(d.getTime() - AR_OFFSET_MS);
  return { year: s.getUTCFullYear(), month: s.getUTCMonth(), day: s.getUTCDate() };
}

function arMidnight(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month, day, 3, 0, 0));
}

function parseArDate(value: string | null, fallback: Date): Date {
  const m = value ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) : null;
  if (!m) return fallback;
  return arMidnight(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

const TYPE_LABELS: Record<string, string> = {
  top_revenue: "Clientes por ventas (top 50)",
  top_orders: "Clientes por pedidos (top 50)",
};

export async function GET(request: NextRequest) {
  const tenantId = requireTenantId(request);
  const qs = request.nextUrl.searchParams;

  const typeKey = qs.get("type") || "top_revenue";
  if (!TYPE_LABELS[typeKey]) {
    return NextResponse.json({ error: "Tipo de reporte inválido." }, { status: 400 });
  }

  const now = new Date();
  const today = arParts(now);
  const defaultFrom = arMidnight(today.year, today.month, 1);
  const defaultTo = arMidnight(today.year, today.month + 1, 1);

  const from = parseArDate(qs.get("from"), defaultFrom);
  const toParam = qs.get("to");
  let to: Date;
  if (toParam) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(toParam);
    to = m ? arMidnight(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + 1) : defaultTo;
  } else {
    to = defaultTo;
  }

  if (from >= to) {
    return NextResponse.json({ error: "Rango de fechas inválido." }, { status: 400 });
  }

  const orders = await prisma.order.findMany({
    where: {
      tenantId,
      createdAt: { gte: from, lt: to },
      status: { in: BILLABLE },
      customerId: { not: null },
    },
    select: {
      customerId: true,
      total: true,
      customer: { select: { firstName: true, lastName: true, phone: true } },
    },
  });

  const byCustomer = new Map<
    string,
    { name: string; phone: string; pedidos: number; total: number }
  >();
  for (const o of orders) {
    if (!o.customerId || !o.customer) continue;
    const cur = byCustomer.get(o.customerId) ?? {
      name: `${o.customer.firstName} ${o.customer.lastName}`.trim(),
      phone: o.customer.phone,
      pedidos: 0,
      total: 0,
    };
    cur.pedidos += 1;
    cur.total += o.total;
    byCustomer.set(o.customerId, cur);
  }

  const all = [...byCustomer.values()];
  all.sort((a, b) =>
    typeKey === "top_orders" ? b.pedidos - a.pedidos : b.total - a.total
  );
  const top = all.slice(0, 50);

  const rows = top.map((c) => [
    c.name || "Sin nombre",
    c.phone,
    c.pedidos,
    formatCurrency(Math.round(c.total / c.pedidos)),
    formatCurrency(Math.round(c.total)),
  ]);

  return NextResponse.json({
    typeLabel: TYPE_LABELS[typeKey],
    columns: ["Cliente", "Teléfono", "Pedidos", "Ticket medio", "Total"],
    rows,
    numericCols: [2, 3, 4],
    summary: [
      `Clientes distintos: ${all.length}`,
      `Pedidos: ${orders.length}`,
      `Facturado: ${formatCurrency(Math.round(orders.reduce((s, o) => s + o.total, 0)))}`,
    ],
  });
}
