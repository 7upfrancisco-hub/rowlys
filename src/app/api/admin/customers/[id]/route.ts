import { NextResponse } from "next/server";
import type { OrderStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { CustomerDetailDTO } from "@/types";

export const dynamic = "force-dynamic";

const BILLABLE: OrderStatus[] = [
  "CONFIRMED",
  "IN_PROGRESS",
  "READY",
  "DELIVERED",
];

const ORDER_INCLUDE = {
  items: { include: { options: true } },
  payment: true,
  driver: { select: { id: true, name: true, phone: true } },
} as const;

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const customer = await prisma.customer.findUnique({
    where: { id: params.id },
  });
  if (!customer) {
    return NextResponse.json({ error: "El cliente no existe." }, { status: 404 });
  }

  const orders = await prisma.order.findMany({
    where: { customerId: customer.id },
    include: ORDER_INCLUDE,
    orderBy: { createdAt: "desc" },
  });

  const billable = orders.filter((o) => BILLABLE.includes(o.status));
  const totalSpent = Math.round(
    billable.reduce((sum, o) => sum + o.total, 0)
  );

  // Direcciones de envío usadas, sin repetir, de la más reciente a la más vieja
  // (orders ya viene ordenado desc por fecha).
  const addresses: string[] = [];
  for (const o of orders) {
    const a = o.deliveryAddress?.trim();
    if (a && !addresses.includes(a)) addresses.push(a);
  }

  const body: CustomerDetailDTO = {
    id: customer.id,
    phone: customer.phone,
    firstName: customer.firstName,
    lastName: customer.lastName,
    email: customer.email,
    ordersCount: billable.length,
    totalSpent,
    firstOrderAt:
      billable[billable.length - 1]?.createdAt.toISOString() ?? null,
    lastOrderAt: billable[0]?.createdAt.toISOString() ?? null,
    createdAt: customer.createdAt.toISOString(),
    addresses,
    // El shape de Prisma con este include coincide con OrderDTO (fechas -> ISO
    // string al serializar). Es lo mismo que devuelve GET /api/orders.
    orders: orders as unknown as CustomerDetailDTO["orders"],
  };

  return NextResponse.json(body);
}
