import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireTenantId } from "@/lib/tenant";
import { formatCurrency } from "@/types";

export const dynamic = "force-dynamic";

// Reportes de cancelaciones para /admin/metricas → pestaña "Reportes".
const AR_OFFSET_MS = 3 * 60 * 60 * 1000;

function arParts(d: Date): { year: number; month: number; day: number } {
  const s = new Date(d.getTime() - AR_OFFSET_MS);
  return { year: s.getUTCFullYear(), month: s.getUTCMonth(), day: s.getUTCDate() };
}

function arMidnight(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month, day, 3, 0, 0));
}

const MONTH_NAMES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

function parseArDate(value: string | null, fallback: Date): Date {
  const m = value ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) : null;
  if (!m) return fallback;
  return arMidnight(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

const TYPE_LABELS: Record<string, string> = {
  day: "Cancelaciones por día",
  month: "Cancelaciones por mes",
};

export async function GET(request: NextRequest) {
  const tenantId = requireTenantId(request);
  const qs = request.nextUrl.searchParams;

  const typeKey = qs.get("type") || "day";
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
    where: { tenantId, createdAt: { gte: from, lt: to }, status: "CANCELLED" },
    select: { createdAt: true, total: true },
  });

  const grouped = new Map<string, { period: string; cancelados: number; total: number }>();
  for (const o of orders) {
    const p = arParts(o.createdAt);
    const sortKey =
      typeKey === "day"
        ? `${p.year}-${String(p.month + 1).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`
        : `${p.year}-${String(p.month + 1).padStart(2, "0")}`;
    const period =
      typeKey === "day"
        ? `${String(p.day).padStart(2, "0")}/${String(p.month + 1).padStart(2, "0")}/${p.year}`
        : `${MONTH_NAMES[p.month]} ${p.year}`;
    const cur = grouped.get(sortKey) ?? { period, cancelados: 0, total: 0 };
    cur.cancelados += 1;
    cur.total += o.total;
    grouped.set(sortKey, cur);
  }

  const sorted = [...grouped.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const rows = sorted.map(([, v]) => [
    v.period,
    v.cancelados,
    formatCurrency(Math.round(v.total)),
  ]);

  return NextResponse.json({
    typeLabel: TYPE_LABELS[typeKey],
    columns: [typeKey === "day" ? "Fecha" : "Mes", "Cancelados", "Total perdido"],
    rows,
    numericCols: [1, 2],
    summary: [
      `Cancelados: ${orders.length}`,
      `Total perdido: ${formatCurrency(Math.round(orders.reduce((s, o) => s + o.total, 0)))}`,
    ],
  });
}
