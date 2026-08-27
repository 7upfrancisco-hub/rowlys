import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

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
    include: { items: { include: { options: true } }, payment: true },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(orders);
}

const createOrderSchema = z
  .object({
    orderType: z.enum(["PICKUP", "DELIVERY"]),
    customerFirstName: z.string().trim().min(1),
    customerLastName: z.string().trim().min(1),
    customerPhone: z.string().trim().min(1),
    customerEmail: z.string().trim().email().optional(),
    deliveryAddress: z.string().trim().min(1).optional(),
    notes: z.string().optional(),
    paymentMethod: z.enum(["CASH", "MP", "MODO", "BANK_TRANSFER"]),
    changeFor: z.number().positive().optional(),
    items: z
      .array(
        z.object({
          productId: z.string(),
          quantity: z.number().int().positive(),
          notes: z.string().optional(),
          optionIds: z.array(z.string()).optional(),
        })
      )
      .min(1),
  })
  .refine((data) => data.orderType !== "DELIVERY" || !!data.deliveryAddress, {
    message: "Falta la dirección de envío.",
    path: ["deliveryAddress"],
  })
  .refine((data) => data.paymentMethod === "CASH" || data.changeFor === undefined, {
    message: "El vuelto solo aplica para pagos en efectivo.",
    path: ["changeFor"],
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

  const productIds = [...new Set(body.items.map((i) => i.productId))];
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    include: {
      modifierGroups: {
        include: { group: { include: { options: true } } },
      },
    },
  });

  if (products.length !== productIds.length) {
    return NextResponse.json(
      { error: "Alguno de los productos ya no existe." },
      { status: 400 }
    );
  }

  const productMap = new Map(products.map((p) => [p.id, p]));

  // Valida cada ítem contra los grupos de adicionales reales del producto
  // (nunca confiar en precios/selecciones que mande el cliente).
  for (const item of body.items) {
    const product = productMap.get(item.productId)!;

    if (!product.available) {
      return NextResponse.json(
        { error: `${product.name} ya no está disponible.` },
        { status: 400 }
      );
    }
    if (body.orderType === "DELIVERY" && !product.availableDelivery) {
      return NextResponse.json(
        { error: `${product.name} no está disponible para envío a domicilio.` },
        { status: 400 }
      );
    }
    if (body.orderType === "PICKUP" && !product.availablePickup) {
      return NextResponse.json(
        { error: `${product.name} no está disponible para retiro en el local.` },
        { status: 400 }
      );
    }

    const selectedIds = new Set(item.optionIds ?? []);
    const validOptionIds = new Set(
      product.modifierGroups.flatMap((pmg) => pmg.group.options.map((o) => o.id))
    );
    for (const id of selectedIds) {
      if (!validOptionIds.has(id)) {
        return NextResponse.json(
          { error: `Adicional inválido para ${product.name}.` },
          { status: 400 }
        );
      }
    }
    for (const pmg of product.modifierGroups) {
      if (!pmg.group.active) continue;
      const count = pmg.group.options.filter(
        (o) => o.active && selectedIds.has(o.id)
      ).length;
      if (count < pmg.group.min || count > pmg.group.max) {
        return NextResponse.json(
          {
            error: `Selección inválida para "${pmg.group.name}" en ${product.name} (mínimo ${pmg.group.min}, máximo ${pmg.group.max}).`,
          },
          { status: 400 }
        );
      }
    }
  }

  const settings = await prisma.settings.findUnique({
    where: { id: "singleton" },
  });
  const deliveryFee =
    body.orderType === "DELIVERY" ? settings?.deliveryFee ?? 0 : 0;

  function optionsFor(productId: string, optionIds?: string[]) {
    const product = productMap.get(productId)!;
    const allOptions = product.modifierGroups.flatMap((pmg) => pmg.group.options);
    return (optionIds ?? []).map((id) => allOptions.find((o) => o.id === id)!);
  }

  const itemsTotal = body.items.reduce((sum, item) => {
    const product = productMap.get(item.productId)!;
    const unitPrice = product.discountPrice ?? product.price;
    const optionsPrice = optionsFor(item.productId, item.optionIds).reduce(
      (s, o) => s + o.price,
      0
    );
    return sum + (unitPrice + optionsPrice) * item.quantity;
  }, 0);

  const total = itemsTotal + deliveryFee;

  const order = await prisma.order.create({
    data: {
      orderType: body.orderType,
      customerFirstName: body.customerFirstName,
      customerLastName: body.customerLastName,
      customerPhone: body.customerPhone,
      customerEmail: body.customerEmail,
      deliveryAddress: body.orderType === "DELIVERY" ? body.deliveryAddress : null,
      deliveryFee,
      total,
      notes: body.notes,
      items: {
        create: body.items.map((item) => {
          const product = productMap.get(item.productId)!;
          const unitPrice = product.discountPrice ?? product.price;
          const chosenOptions = optionsFor(item.productId, item.optionIds);
          return {
            productId: product.id,
            productName: product.name,
            price: unitPrice,
            quantity: item.quantity,
            notes: item.notes,
            options: {
              create: chosenOptions.map((o) => ({ name: o.title, price: o.price })),
            },
          };
        }),
      },
      payment: {
        create: {
          provider: body.paymentMethod,
          amount: total,
          changeFor: body.changeFor,
        },
      },
    },
    include: { items: { include: { options: true } }, payment: true },
  });

  return NextResponse.json(order, { status: 201 });
}
