import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const orderStatusSchema = z.enum([
  "PENDING",
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
      OR: [{ payment: { provider: "CASH" } }, { payment: { status: "CONFIRMED" } }],
    },
    include: { items: true, payment: true },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(orders);
}

const createOrderSchema = z
  .object({
    orderType: z.enum(["PICKUP", "DELIVERY"]),
    customerName: z.string().trim().min(1),
    customerPhone: z.string().trim().min(1),
    deliveryAddress: z.string().trim().min(1).optional(),
    notes: z.string().optional(),
    paymentMethod: z.enum(["CASH", "MP", "MODO"]),
    items: z
      .array(
        z.object({
          productId: z.string(),
          quantity: z.number().int().positive(),
          notes: z.string().optional(),
        })
      )
      .min(1),
  })
  .refine((data) => data.orderType !== "DELIVERY" || !!data.deliveryAddress, {
    message: "Falta la dirección de envío.",
    path: ["deliveryAddress"],
  });

export async function POST(request: Request) {
  const parsed = createOrderSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Datos del pedido inválidos." },
      { status: 400 }
    );
  }
  const body = parsed.data;

  const productIds = body.items.map((i) => i.productId);
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
  });

  if (products.length !== new Set(productIds).size) {
    return NextResponse.json(
      { error: "Alguno de los productos ya no existe." },
      { status: 400 }
    );
  }

  const settings = await prisma.settings.findUnique({
    where: { id: "singleton" },
  });
  const deliveryFee =
    body.orderType === "DELIVERY" ? settings?.deliveryFee ?? 0 : 0;

  const itemsTotal = body.items.reduce((sum, item) => {
    const product = products.find((p) => p.id === item.productId)!;
    return sum + product.price * item.quantity;
  }, 0);

  const total = itemsTotal + deliveryFee;

  const order = await prisma.order.create({
    data: {
      orderType: body.orderType,
      customerName: body.customerName,
      customerPhone: body.customerPhone,
      deliveryAddress: body.orderType === "DELIVERY" ? body.deliveryAddress : null,
      deliveryFee,
      total,
      notes: body.notes,
      items: {
        create: body.items.map((item) => {
          const product = products.find((p) => p.id === item.productId)!;
          return {
            productId: product.id,
            productName: product.name,
            price: product.price,
            quantity: item.quantity,
            notes: item.notes,
          };
        }),
      },
      payment: {
        create: {
          provider: body.paymentMethod,
          amount: total,
        },
      },
    },
    include: { items: true, payment: true },
  });

  return NextResponse.json(order, { status: 201 });
}
