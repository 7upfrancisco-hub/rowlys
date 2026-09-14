import { NextResponse } from "next/server";
import type { OrderStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Mismo criterio que /api/admin/customers (pedidos que el local aceptó).
const BILLABLE: OrderStatus[] = ["CONFIRMED", "IN_PROGRESS", "READY", "DELIVERED"];

// Base de clientes de TODA la plataforma (consumidores finales que compraron
// en cualquier local que usa Blend) — lo que pidió el usuario para tener
// visión propia, más allá de lo que cada local ve de sus propios clientes
// en /admin/clientes. Sin `where` de tenant a propósito: es la vista de
// super-admin.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const search = (searchParams.get("search") ?? "").trim();
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
    include: { tenant: { select: { name: true, slug: true } } },
  });

  const ids = customers.map((c) => c.id);
  const stats = ids.length
    ? await prisma.order.groupBy({
        by: ["customerId"],
        where: { customerId: { in: ids }, status: { in: BILLABLE } },
        _sum: { total: true },
        _count: { _all: true },
      })
    : [];
  const statByCustomer = new Map(stats.map((s) => [s.customerId, s]));

  const rows = customers.map((c) => {
    const s = statByCustomer.get(c.id);
    return {
      id: c.id,
      phone: c.phone,
      firstName: c.firstName,
      lastName: c.lastName,
      email: c.email,
      ordersCount: s?._count._all ?? 0,
      totalSpent: Math.round(s?._sum.total ?? 0),
      createdAt: c.createdAt.toISOString(),
      tenantName: c.tenant?.name ?? "—",
      tenantSlug: c.tenant?.slug ?? null,
    };
  });

  return NextResponse.json(rows);
}
