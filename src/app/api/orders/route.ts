import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createOrder, createOrderSchema } from "@/lib/orders";
import { sweepPhantomOrders } from "@/lib/phantom-orders";

export const dynamic = "force-dynamic";

// Barrido oportunista de pedidos MP abandonados. La comanda consulta este
// endpoint cada 5s, así que con este throttle el barrido corre ~cada 10 min sin
// necesidad de un cron. No bloquea la respuesta.
const SWEEP_EVERY_MS = 10 * 60 * 1000;
let lastSweepAt = 0;

function maybeSweepPhantomOrders() {
  const now = Date.now();
  if (now - lastSweepAt < SWEEP_EVERY_MS) return;
  lastSweepAt = now;
  sweepPhantomOrders()
    .then((n) => {
      if (n > 0) console.log(`Pedidos fantasma cancelados: ${n}`);
    })
    .catch((err) => console.error("Barrido de pedidos fantasma falló:", err));
}

const orderStatusSchema = z.enum([
  "PENDING",
  "CONFIRMED",
  "IN_PROGRESS",
  "READY",
  "DELIVERED",
  "CANCELLED",
]);

export async function GET(request: Request) {
  maybeSweepPhantomOrders();

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
      // Un pedido que se paga con Mercado Pago no llega a la comanda hasta que
      // el webhook confirma el pago. Si el cliente no termina de pagar, queda
      // oculto para la cocina (sigue accesible en /pedido/[id] para reintentar).
      NOT: { payment: { provider: "MP", status: { not: "CONFIRMED" } } },
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
