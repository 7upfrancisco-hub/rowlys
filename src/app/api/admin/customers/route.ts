import { NextResponse } from "next/server";
import type { OrderStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { CustomerDTO } from "@/types";

export const dynamic = "force-dynamic";

// Pedidos que cuentan para "total gastado" / "cantidad de pedidos": los que el
// local aceptó. Mismo criterio que /admin/metricas.
const BILLABLE: OrderStatus[] = [
  "CONFIRMED",
  "IN_PROGRESS",
  "READY",
  "DELIVERED",
];

type Sort = "recent" | "orders" | "spent" | "name";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const search = (searchParams.get("search") ?? "").trim();
  const sort = (searchParams.get("sort") ?? "recent") as Sort;

  const digits = search.replace(/\D/g, "");
  const where = search
    ? {
        OR: [
          { firstName: { contains: search, mode: "insensitive" as const } },
          { lastName: { contains: search, mode: "insensitive" as const } },
          ...(digits ? [{ phone: { contains: digits } }] : []),
        ],
      }
    : {};

  const customers = await prisma.customer.findMany({
    where,
    take: 500,
    orderBy: { updatedAt: "desc" },
  });

  const ids = customers.map((c) => c.id);
  const stats = ids.length
    ? await prisma.order.groupBy({
        by: ["customerId"],
        where: { customerId: { in: ids }, status: { in: BILLABLE } },
        _sum: { total: true },
        _count: { _all: true },
        _min: { createdAt: true },
        _max: { createdAt: true },
      })
    : [];

  const statByCustomer = new Map(stats.map((s) => [s.customerId, s]));

  const rows: CustomerDTO[] = customers.map((c) => {
    const s = statByCustomer.get(c.id);
    return {
      id: c.id,
      phone: c.phone,
      firstName: c.firstName,
      lastName: c.lastName,
      email: c.email,
      ordersCount: s?._count._all ?? 0,
      totalSpent: Math.round(s?._sum.total ?? 0),
      firstOrderAt: s?._min.createdAt?.toISOString() ?? null,
      lastOrderAt: s?._max.createdAt?.toISOString() ?? null,
      createdAt: c.createdAt.toISOString(),
    };
  });

  rows.sort((a, b) => {
    if (sort === "orders") return b.ordersCount - a.ordersCount;
    if (sort === "spent") return b.totalSpent - a.totalSpent;
    if (sort === "name")
      return `${a.firstName} ${a.lastName}`.localeCompare(
        `${b.firstName} ${b.lastName}`,
        "es"
      );
    // recent: último pedido facturable primero; los que no tienen, al final.
    const at = a.lastOrderAt ? Date.parse(a.lastOrderAt) : 0;
    const bt = b.lastOrderAt ? Date.parse(b.lastOrderAt) : 0;
    return bt - at;
  });

  return NextResponse.json(rows);
}
