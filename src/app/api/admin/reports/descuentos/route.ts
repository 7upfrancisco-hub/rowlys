import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireTenantId } from "@/lib/tenant";
import { DISCOUNT_KIND_LABELS, formatCurrency, type DiscountKind, type OrderStatus } from "@/types";

export const dynamic = "force-dynamic";

// Reportes de descuentos para /admin/metricas → pestaña "Reportes": listado
// (no agregado) de cupones canjeados y de descuentos automáticos aplicados
// en el rango elegido. "Manuales" no existe en Blend (no hay descuento
// libre a mano en el checkout), por eso solo estos dos tipos.
//
// Mismo criterio de "facturable" que el resto de Reportes: un cupón o
// descuento aplicado a un pedido que después se canceló (o que nunca se
// aceptó) no cuenta — si no, el total de acá no cierra contra "Descuentos"
// del reporte de Ventas para el mismo rango.
const BILLABLE: OrderStatus[] = [
  "CONFIRMED",
  "IN_PROGRESS",
  "READY",
  "DELIVERED",
];

// Techo de filas para no devolver listados enormes en un rango muy amplio
// (ej. "Este año" en un local con mucho uso de cupones). Si se llega al
// techo, se avisa en el summary para que achiquen el rango.
const MAX_ROWS = 1000;

const AR_OFFSET_MS = 3 * 60 * 60 * 1000;

function arParts(d: Date): { year: number; month: number; day: number } {
  const s = new Date(d.getTime() - AR_OFFSET_MS);
  return { year: s.getUTCFullYear(), month: s.getUTCMonth(), day: s.getUTCDate() };
}

function arMidnight(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month, day, 3, 0, 0));
}

function arDate(d: Date): string {
  const p = arParts(d);
  return `${String(p.day).padStart(2, "0")}/${String(p.month + 1).padStart(2, "0")}/${p.year}`;
}

function parseArDate(value: string | null, fallback: Date): Date {
  const m = value ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) : null;
  if (!m) return fallback;
  return arMidnight(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

const TYPE_LABELS: Record<string, string> = {
  cupones: "Cupones usados",
  automaticos: "Descuentos automáticos",
};

export async function GET(request: NextRequest) {
  const tenantId = requireTenantId(request);
  const qs = request.nextUrl.searchParams;

  const typeKey = qs.get("type") || "cupones";
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

  if (typeKey === "cupones") {
    const redemptions = await prisma.couponRedemption.findMany({
      where: {
        coupon: { tenantId },
        order: { status: { in: BILLABLE } },
        createdAt: { gte: from, lt: to },
      },
      orderBy: { createdAt: "asc" },
      take: MAX_ROWS,
      select: {
        createdAt: true,
        discountAmount: true,
        coupon: { select: { code: true } },
        order: {
          select: { number: true, customerFirstName: true, customerLastName: true },
        },
      },
    });

    const rows = redemptions.map((r) => [
      arDate(r.createdAt),
      r.order ? `#${r.order.number}` : "—",
      r.coupon.code,
      r.order ? `${r.order.customerFirstName} ${r.order.customerLastName}`.trim() : "—",
      formatCurrency(Math.round(r.discountAmount)),
    ]);

    return NextResponse.json({
      typeLabel: TYPE_LABELS.cupones,
      columns: ["Fecha", "Nº pedido", "Código", "Cliente", "Descuento"],
      rows,
      numericCols: [4],
      summary: [
        `Cupones usados: ${redemptions.length}`,
        `Total descontado: ${formatCurrency(
          Math.round(redemptions.reduce((s, r) => s + r.discountAmount, 0))
        )}`,
        ...(redemptions.length === MAX_ROWS
          ? [`Mostrando los primeros ${MAX_ROWS} — achicá el rango para ver todos.`]
          : []),
      ],
    });
  }

  // automaticos
  const applications = await prisma.discountApplication.findMany({
    where: {
      order: { tenantId, status: { in: BILLABLE } },
      createdAt: { gte: from, lt: to },
    },
    orderBy: { createdAt: "asc" },
    take: MAX_ROWS,
    select: {
      createdAt: true,
      amount: true,
      kind: true,
      title: true,
      order: { select: { number: true } },
    },
  });

  const rows = applications.map((a) => [
    arDate(a.createdAt),
    a.order ? `#${a.order.number}` : "—",
    a.kind ? DISCOUNT_KIND_LABELS[a.kind as DiscountKind] : "—",
    a.title,
    formatCurrency(Math.round(a.amount)),
  ]);

  return NextResponse.json({
    typeLabel: TYPE_LABELS.automaticos,
    columns: ["Fecha", "Nº pedido", "Tipo", "Detalle", "Descuento"],
    rows,
    numericCols: [4],
    summary: [
      `Aplicaciones: ${applications.length}`,
      `Total descontado: ${formatCurrency(
        Math.round(applications.reduce((s, a) => s + a.amount, 0))
      )}`,
      ...(applications.length === MAX_ROWS
        ? [`Mostrando los primeros ${MAX_ROWS} — achicá el rango para ver todos.`]
        : []),
    ],
  });
}
