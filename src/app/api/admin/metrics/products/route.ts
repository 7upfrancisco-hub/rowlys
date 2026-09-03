import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import type { OrderStatus } from "@/types";

export const dynamic = "force-dynamic";

// Argentina es UTC-3 fijo (sin horario de verano).
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

// Mismo criterio que /api/admin/metrics/history: solo pedidos que el local aceptó.
const BILLABLE: OrderStatus[] = [
  "CONFIRMED",
  "IN_PROGRESS",
  "READY",
  "DELIVERED",
];

// Los ítems cuyo producto ya no existe (productId = null) o cuya categoría se
// borró caen acá.
const NO_CATEGORY = "Sin categoría";

type Agg = { units: number; revenue: number };

type Bucket = {
  units: number;
  revenue: number;
  categories: Map<string, Agg>;
  products: Map<string, Agg & { category: string }>;
};

const emptyBucket = (): Bucket => ({
  units: 0,
  revenue: 0,
  categories: new Map(),
  products: new Map(),
});

function add(
  b: Bucket,
  category: string,
  product: string,
  units: number,
  revenue: number
) {
  b.units += units;
  b.revenue += revenue;
  const c = b.categories.get(category) ?? { units: 0, revenue: 0 };
  c.units += units;
  c.revenue += revenue;
  b.categories.set(category, c);
  const p = b.products.get(product) ?? { category, units: 0, revenue: 0 };
  p.units += units;
  p.revenue += revenue;
  b.products.set(product, p);
}

function serialize(b: Bucket) {
  return {
    units: b.units,
    revenue: b.revenue,
    categories: [...b.categories.entries()]
      .map(([name, a]) => ({ name, units: a.units, revenue: a.revenue }))
      .sort((x, y) => y.revenue - x.revenue),
    products: [...b.products.entries()]
      .map(([name, a]) => ({
        name,
        category: a.category,
        units: a.units,
        revenue: a.revenue,
      }))
      .sort((x, y) => y.units - x.units),
  };
}

// Ventas por categoría y por producto del mes, desglosadas día por día, para el
// panel "Ventas por categoría" de /admin/metricas.
export async function GET(request: NextRequest) {
  const now = new Date();
  const current = arParts(now);

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

  const start = arMidnight(sy, sm, 1);
  const end = arMidnight(sy, sm + 1, 1);
  const daysInMonth = new Date(Date.UTC(sy, sm + 1, 0)).getUTCDate();

  const orders = await prisma.order.findMany({
    where: { createdAt: { gte: start, lt: end } },
    select: {
      createdAt: true,
      status: true,
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

  const byDay: Bucket[] = Array.from({ length: daysInMonth }, emptyBucket);
  const monthBucket = emptyBucket();

  for (const o of orders) {
    if (!BILLABLE.includes(o.status)) continue;
    const { day } = arParts(o.createdAt);
    const dayBucket = byDay[day - 1];
    for (const it of o.items) {
      const optSum = it.options.reduce((s, x) => s + x.price, 0);
      // Precio de línea, mismo criterio que el total del pedido:
      // (precio unitario del ítem + suma de opciones) × cantidad.
      const revenue = (it.price + optSum) * it.quantity;
      const category = it.product?.category?.name ?? NO_CATEGORY;
      if (dayBucket) add(dayBucket, category, it.productName, it.quantity, revenue);
      add(monthBucket, category, it.productName, it.quantity, revenue);
    }
  }

  return NextResponse.json({
    month: `${sy}-${String(sm + 1).padStart(2, "0")}`,
    daysInMonth,
    days: byDay.map((b, i) => ({ day: i + 1, ...serialize(b) })),
    monthTotal: serialize(monthBucket),
  });
}
