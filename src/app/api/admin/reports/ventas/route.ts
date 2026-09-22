import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireTenantId } from "@/lib/tenant";
import { formatCurrency, type OrderStatus, type OrderType, type PaymentProvider } from "@/types";

export const dynamic = "force-dynamic";

// Reportes de ventas para /admin/metricas (pestaña "Reportes"). Mismo
// criterio de "facturable" que el resto de Métricas (ver history/export):
// pedidos que el local aceptó, de CONFIRMED en adelante.
const BILLABLE: OrderStatus[] = [
  "CONFIRMED",
  "IN_PROGRESS",
  "READY",
  "DELIVERED",
];

// Argentina es UTC-3 fijo (sin horario de verano). Mismo bloque que en
// history/export — se duplica a propósito, cada ruta es chica y aislada.
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

const CHANNEL_LABELS: Record<OrderType, string> = {
  DELIVERY: "Delivery",
  PICKUP: "Takeaway",
};

const PAYMENT_LABELS: Record<PaymentProvider, string> = {
  CASH: "Efectivo",
  MP: "Mercado Pago",
  BANK_TRANSFER: "Transferencia",
};

type Dim = "channel" | "payment" | "driver";

// Config de cada "Tipo de reporte" del selector. `groupBy` decide si las
// filas son por día, por mes o por categoría; `dims` son las columnas extra
// con las que se cruza (en el orden en que se muestran).
const REPORT_TYPES: Record<
  string,
  { label: string; groupBy: "day" | "month" | "category"; dims: Dim[] }
> = {
  day: { label: "Ventas por día", groupBy: "day", dims: [] },
  day_channel: { label: "Ventas por día, canal", groupBy: "day", dims: ["channel"] },
  day_payment: { label: "Ventas por día, método de pago", groupBy: "day", dims: ["payment"] },
  day_channel_payment: {
    label: "Ventas por día, canal y método de pago",
    groupBy: "day",
    dims: ["channel", "payment"],
  },
  day_driver: { label: "Ventas por día, repartidor", groupBy: "day", dims: ["driver"] },
  month: { label: "Ventas por mes", groupBy: "month", dims: [] },
  month_channel: { label: "Ventas por mes, canal", groupBy: "month", dims: ["channel"] },
  month_payment: { label: "Ventas por mes, método de pago", groupBy: "month", dims: ["payment"] },
  month_channel_payment: {
    label: "Ventas por mes, canal y método de pago",
    groupBy: "month",
    dims: ["channel", "payment"],
  },
  month_driver: { label: "Ventas por mes, repartidor", groupBy: "month", dims: ["driver"] },
  category: { label: "Ventas por categoría", groupBy: "category", dims: [] },
};

const DIM_LABELS: Record<Dim, string> = {
  channel: "Canal de venta",
  payment: "Método de pago",
  driver: "Repartidor",
};

function parseArDate(value: string | null, fallback: Date): Date {
  const m = value ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) : null;
  if (!m) return fallback;
  return arMidnight(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export async function GET(request: NextRequest) {
  const tenantId = requireTenantId(request);
  const qs = request.nextUrl.searchParams;

  const typeKey = qs.get("type") || "day";
  const config = REPORT_TYPES[typeKey];
  if (!config) {
    return NextResponse.json({ error: "Tipo de reporte inválido." }, { status: 400 });
  }

  const now = new Date();
  const today = arParts(now);
  const defaultFrom = arMidnight(today.year, today.month, 1);
  const defaultTo = arMidnight(today.year, today.month + 1, 1);

  const from = parseArDate(qs.get("from"), defaultFrom);
  // "to" es inclusive del lado del cliente (último día del rango); acá se
  // convierte al inicio del día siguiente para el filtro `lt`.
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
    where: { tenantId, createdAt: { gte: from, lt: to }, status: { in: BILLABLE } },
    select: {
      createdAt: true,
      total: true,
      orderType: true,
      driver: { select: { name: true } },
      payment: { select: { provider: true } },
      discountApplications: { select: { amount: true } },
      couponRedemption: { select: { discountAmount: true } },
      items: {
        select: {
          quantity: true,
          price: true,
          options: { select: { price: true } },
          product: { select: { category: { select: { name: true } } } },
        },
      },
    },
  });

  function orderDiscount(o: (typeof orders)[number]): number {
    const applied = o.discountApplications.reduce((s, a) => s + a.amount, 0);
    const coupon = o.couponRedemption?.discountAmount ?? 0;
    return applied + coupon;
  }

  // --- Ventas por categoría: una fila por categoría, sin dimensión temporal ---
  if (config.groupBy === "category") {
    const byCategory = new Map<string, { units: number; revenue: number }>();
    for (const o of orders) {
      for (const it of o.items) {
        const name = it.product?.category.name ?? "Sin categoría";
        const cur = byCategory.get(name) ?? { units: 0, revenue: 0 };
        // Precio de línea = (precio unitario + adicionales pagos) × cantidad,
        // mismo criterio que /api/admin/metrics/products.
        const optSum = it.options.reduce((s, x) => s + x.price, 0);
        cur.units += it.quantity;
        cur.revenue += (it.price + optSum) * it.quantity;
        byCategory.set(name, cur);
      }
    }
    const sorted = [...byCategory.entries()].sort((a, b) => b[1].revenue - a[1].revenue);
    const rows = sorted.map(([name, v]) => [
      name,
      v.units,
      formatCurrency(Math.round(v.revenue)),
    ]);
    return NextResponse.json({
      typeLabel: config.label,
      columns: ["Categoría", "Unidades", "Total"],
      rows,
      numericCols: [1, 2],
      summary: [
        `Pedidos: ${orders.length}`,
        `Facturado: ${formatCurrency(orders.reduce((s, o) => s + o.total, 0))}`,
      ],
    });
  }

  // --- Ventas por día / por mes, con las dimensiones pedidas ---
  type Row = { pedidos: number; descuentos: number; total: number };
  const grouped = new Map<string, { period: string; sortKey: string; dims: string[]; row: Row }>();

  for (const o of orders) {
    const p = arParts(o.createdAt);
    const period =
      config.groupBy === "day"
        ? `${String(p.day).padStart(2, "0")}/${String(p.month + 1).padStart(2, "0")}/${p.year}`
        : `${MONTH_NAMES[p.month]} ${p.year}`;
    const sortKey =
      config.groupBy === "day"
        ? `${p.year}-${String(p.month + 1).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`
        : `${p.year}-${String(p.month + 1).padStart(2, "0")}`;

    const dimValues = config.dims.map((d) => {
      if (d === "channel") return CHANNEL_LABELS[o.orderType];
      if (d === "payment") return o.payment ? PAYMENT_LABELS[o.payment.provider] : "Sin pago";
      return o.driver?.name ?? "Sin asignar";
    });

    const key = [sortKey, ...dimValues].join("|");
    const cur = grouped.get(key) ?? {
      period,
      sortKey,
      dims: dimValues,
      row: { pedidos: 0, descuentos: 0, total: 0 },
    };
    cur.row.pedidos += 1;
    cur.row.descuentos += orderDiscount(o);
    cur.row.total += o.total;
    grouped.set(key, cur);
  }

  const sortedRows = [...grouped.values()].sort((a, b) => {
    if (a.sortKey !== b.sortKey) return a.sortKey < b.sortKey ? -1 : 1;
    for (let i = 0; i < a.dims.length; i++) {
      if (a.dims[i] !== b.dims[i]) return a.dims[i] < b.dims[i] ? -1 : 1;
    }
    return 0;
  });

  const periodColLabel = config.groupBy === "day" ? "Fecha" : "Mes";
  const columns = [
    periodColLabel,
    ...config.dims.map((d) => DIM_LABELS[d]),
    "Pedidos",
    "Descuentos",
    "Ticket medio",
    "Total",
  ];
  const baseIdx = 1 + config.dims.length; // primer índice numérico (Pedidos)

  const rows = sortedRows.map((r) => {
    const ticketMedio = r.row.pedidos > 0 ? r.row.total / r.row.pedidos : 0;
    return [
      r.period,
      ...r.dims,
      r.row.pedidos,
      formatCurrency(Math.round(r.row.descuentos)),
      formatCurrency(Math.round(ticketMedio)),
      formatCurrency(Math.round(r.row.total)),
    ];
  });

  const totalPedidos = orders.length;
  const totalRevenue = orders.reduce((s, o) => s + o.total, 0);
  const totalDescuentos = orders.reduce((s, o) => s + orderDiscount(o), 0);

  return NextResponse.json({
    typeLabel: config.label,
    columns,
    rows,
    numericCols: [baseIdx, baseIdx + 1, baseIdx + 2, baseIdx + 3],
    summary: [
      `Pedidos: ${totalPedidos}`,
      `Descuentos: ${formatCurrency(Math.round(totalDescuentos))}`,
      `Ticket medio: ${formatCurrency(totalPedidos ? Math.round(totalRevenue / totalPedidos) : 0)}`,
      `Total: ${formatCurrency(Math.round(totalRevenue))}`,
    ],
  });
}
