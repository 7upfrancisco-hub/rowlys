import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createOrder, createOrderSchema } from "@/lib/orders";

export const dynamic = "force-dynamic";

const orderStatusSchema = z.enum([
  "PENDING",
  "CONFIRMED",
  "IN_PROGRESS",
  "READY",
  "DELIVERED",
  "CANCELLED",
]);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const statusParam = searchParams.get("status");

  let statuses: z.infer<typeof orderStatusSchema>[] | undefined;
  if (statusParam) {
    const parsed = z
      .array(orderStatusSchema)
      .safeParse(statusParam.split(",").map((s) => s.trim()));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Parámetro status inválido." },
        { status: 400 }
      );
    }
    statuses = parsed.data;
  }

  const orders = await prisma.order.findMany({
    where: {
      status: statuses ? { in: statuses } : { notIn: ["DELIVERED", "CANCELLED"] },
    },
    include: {
      items: { include: { options: true } },
      payment: true,
      driver: { select: { id: true, name: true, phone: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(orders);
}

export async function POST(request: Request) {
  const parsed = createOrderSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Datos del pedido inválidos." },
      { status: 400 }
    );
  }

  const result = await createOrder(parsed.data, { enforceStoreStatus: true });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result.order, { status: 201 });
}
