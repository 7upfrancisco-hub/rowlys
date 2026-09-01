import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

// Lógica compartida de creación de pedidos. La usan dos rutas:
//  - POST /api/orders        (checkout público, respeta el estado del local)
//  - POST /api/admin/orders  (carga manual desde /comanda, con sesión)
// Nunca se confía en precios/selecciones que llegan del cliente: se revalida
// todo contra la base y el total se recalcula acá.

export const createOrderSchema = z
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

export type CreateOrderInput = z.infer<typeof createOrderSchema>;

const orderInclude = {
  items: { include: { options: true } },
  payment: true,
} satisfies Prisma.OrderInclude;

export type OrderWithRelations = Prisma.OrderGetPayload<{
  include: typeof orderInclude;
}>;

export type CreateOrderResult =
  | { ok: true; order: OrderWithRelations }
  | { ok: false; status: number; error: string };

interface CreateOrderOptions {
  // El checkout público no puede tomar pedidos con el local cerrado o el canal
  // pausado; la carga manual del staff sí (está tomando el pedido de frente).
  enforceStoreStatus: boolean;
  // Un pedido cargado por el staff ya está aceptado.
  initialStatus?: "PENDING" | "CONFIRMED";
}

export async function createOrder(
  body: CreateOrderInput,
  opts: CreateOrderOptions
): Promise<CreateOrderResult> {
  const settings = await prisma.settings.findUnique({
    where: { id: "singleton" },
  });

  if (opts.enforceStoreStatus && settings) {
    if (!settings.storeOpen) {
      return {
        ok: false,
        status: 409,
        error: "El local está cerrado en este momento. No se pueden tomar pedidos.",
      };
    }
    if (body.orderType === "DELIVERY" && !settings.deliveryEnabled) {
      return {
        ok: false,
        status: 409,
        error: "El envío a domicilio está pausado en este momento.",
      };
    }
    if (body.orderType === "PICKUP" && !settings.pickupEnabled) {
      return {
        ok: false,
        status: 409,
        error: "El retiro en el local está pausado en este momento.",
      };
    }
  }

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
    return { ok: false, status: 400, error: "Alguno de los productos ya no existe." };
  }

  const productMap = new Map(products.map((p) => [p.id, p]));

  // Valida cada ítem contra los grupos de adicionales reales del producto.
  for (const item of body.items) {
    const product = productMap.get(item.productId)!;

    if (!product.available) {
      return { ok: false, status: 400, error: `${product.name} ya no está disponible.` };
    }
    if (body.orderType === "DELIVERY" && !product.availableDelivery) {
      return {
        ok: false,
        status: 400,
        error: `${product.name} no está disponible para envío a domicilio.`,
      };
    }
    if (body.orderType === "PICKUP" && !product.availablePickup) {
      return {
        ok: false,
        status: 400,
        error: `${product.name} no está disponible para retiro en el local.`,
      };
    }

    const selectedIds = new Set(item.optionIds ?? []);
    const validOptionIds = new Set(
      product.modifierGroups.flatMap((pmg) => pmg.group.options.map((o) => o.id))
    );
    for (const id of selectedIds) {
      if (!validOptionIds.has(id)) {
        return {
          ok: false,
          status: 400,
          error: `Adicional inválido para ${product.name}.`,
        };
      }
    }
    for (const pmg of product.modifierGroups) {
      if (!pmg.group.active) continue;
      const count = pmg.group.options.filter(
        (o) => o.active && selectedIds.has(o.id)
      ).length;
      if (count < pmg.group.min || count > pmg.group.max) {
        return {
          ok: false,
          status: 400,
          error: `Selección inválida para "${pmg.group.name}" en ${product.name} (mínimo ${pmg.group.min}, máximo ${pmg.group.max}).`,
        };
      }
    }
  }

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
      deliveryAddress:
        body.orderType === "DELIVERY" ? body.deliveryAddress : null,
      deliveryFee,
      total,
      status: opts.initialStatus ?? "PENDING",
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
    include: orderInclude,
  });

  return { ok: true, order };
}
