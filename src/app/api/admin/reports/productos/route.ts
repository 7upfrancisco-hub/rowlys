import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireTenantId } from "@/lib/tenant";
import { formatCurrency, type OrderStatus } from "@/types";

export const dynamic = "force-dynamic";

// Reportes de productos para /admin/metricas → pestaña "Reportes". Mismo
// criterio de "facturable" y mismo cálculo de línea (precio + adicionales
// pagos) × cantidad que /api/admin/metrics/products.
const BILLABLE: OrderStatus[] = [
  "CONFIRMED",
  "IN_PROGRESS",
  "READY",
  "DELIVERED",
];
const NO_CATEGORY = "Sin categoría";

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
  by_product: "Ventas por producto",
  by_category_product: "Ventas por categoría, producto",
};

export async function GET(request: NextRequest) {
  const tenantId = requireTenantId(request);
  const qs = request.nextUrl.searchParams;

  const typeKey = qs.get("type") || "by_product";
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
    where: { tenantId, createdAt: { gte: from, lt: to }, status: { in: BILLABLE } },
    select: {
      items: {
        select: {
          productName: true,
          price: true,
          quantity: true,
          options: { select: { price: true } },
          product: { select: { category: { select: { name: true } } } },
        },
      },
    },
  });

  // Clave: productName solo (by_product) o "categoría||producto" (para poder
  // separar el mismo nombre de producto repetido en categorías distintas,
  // caso raro pero posible si se recategoriza).
  const byKey = new Map<
    string,
    { category: string; product: string; units: number; revenue: number }
  >();
  let totalUnits = 0;
  let totalRevenue = 0;

  for (const o of orders) {
    for (const it of o.items) {
      const category = it.product?.category?.name ?? NO_CATEGORY;
      const optSum = it.options.reduce((s, x) => s + x.price, 0);
      const revenue = (it.price + optSum) * it.quantity;
      const key = typeKey === "by_category_product" ? `${category}||${it.productName}` : it.productName;
      const cur = byKey.get(key) ?? {
        category,
        product: it.productName,
        units: 0,
        revenue: 0,
      };
      cur.units += it.quantity;
      cur.revenue += revenue;
      byKey.set(key, cur);
      totalUnits += it.quantity;
      totalRevenue += revenue;
    }
  }

  const rowsData = [...byKey.values()];
  if (typeKey === "by_category_product") {
    rowsData.sort((a, b) => a.category.localeCompare(b.category) || b.units - a.units);
  } else {
    rowsData.sort((a, b) => b.units - a.units);
  }

  const columns =
    typeKey === "by_category_product"
      ? ["Categoría", "Producto", "Unidades", "Total"]
      : ["Producto", "Unidades", "Total"];

  const rows = rowsData.map((r) =>
    typeKey === "by_category_product"
      ? [r.category, r.product, r.units, formatCurrency(Math.round(r.revenue))]
      : [r.product, r.units, formatCurrency(Math.round(r.revenue))]
  );

  const numericCols = typeKey === "by_category_product" ? [2, 3] : [1, 2];

  return NextResponse.json({
    typeLabel: TYPE_LABELS[typeKey],
    columns,
    rows,
    numericCols,
    summary: [
      `Productos distintos: ${byKey.size}`,
      `Unidades: ${totalUnits}`,
      `Total: ${formatCurrency(Math.round(totalRevenue))}`,
    ],
  });
}
