import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { normalizeArPhone } from "@/lib/phone";

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
  driver: { select: { id: true, name: true, phone: true } },
} satisfies Prisma.OrderInclude;

export type OrderWithRelations = Prisma.OrderGetPayload<{
  include: typeof orderInclude;
}>;

export type CreateOrderResult =
  | { ok: true; order: OrderWithRelations }
  | { ok: false; status: number; error: string };

// --- Validación + precios de ítems (compartido entre crear y editar) ---------

interface ItemInput {
  productId: string;
  quantity: number;
  notes?: string;
  optionIds?: string[];
}

type ResolvedItems =
  | {
      ok: true;
      create: Prisma.OrderItemUncheckedCreateWithoutOrderInput[];
      itemsTotal: number;
    }
  | { ok: false; status: number; error: string };

// Revalida cada ítem contra la base (producto existe / disponible en el canal /
// adicionales válidos y dentro de min-max) y arma el `create` anidado con los
// precios recalculados. Nunca confía en lo que manda el cliente.
async function resolveItems(
  items: ItemInput[],
  orderType: "PICKUP" | "DELIVERY"
): Promise<ResolvedItems> {
  const productIds = [...new Set(items.map((i) => i.productId))];
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

  for (const item of items) {
    const product = productMap.get(item.productId)!;

    if (!product.available) {
      return { ok: false, status: 400, error: `${product.name} ya no está disponible.` };
    }
    if (orderType === "DELIVERY" && !product.availableDelivery) {
      return {
        ok: false,
        status: 400,
        error: `${product.name} no está disponible para envío a domicilio.`,
      };
    }
    if (orderType === "PICKUP" && !product.availablePickup) {
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

  function optionsFor(productId: string, optionIds?: string[]) {
    const product = productMap.get(productId)!;
    const allOptions = product.modifierGroups.flatMap((pmg) => pmg.group.options);
    return (optionIds ?? []).map((id) => allOptions.find((o) => o.id === id)!);
  }

  let itemsTotal = 0;
  const create: Prisma.OrderItemUncheckedCreateWithoutOrderInput[] = items.map((item) => {
    const product = productMap.get(item.productId)!;
    const unitPrice = product.discountPrice ?? product.price;
    const chosenOptions = optionsFor(item.productId, item.optionIds);
    const optionsPrice = chosenOptions.reduce((s, o) => s + o.price, 0);
    itemsTotal += (unitPrice + optionsPrice) * item.quantity;
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
  });

  return { ok: true, create, itemsTotal };
}

// --- Editar los ítems de un pedido existente (desde /comanda) ----------------

export const editOrderItemsSchema = z.object({
  // Nota del pedido. "" limpia la nota; undefined la deja como está.
  notes: z.string().max(200).optional(),
  lines: z
    .array(
      z.union([
        // Línea que ya estaba: se conserva el snapshot del ítem, solo cambia
        // la cantidad. Sirve aunque el producto ya no exista en el catálogo.
        z.object({
          keepItemId: z.string(),
          quantity: z.number().int().positive(),
        }),
        // Línea nueva/cambiada: se revalida y recalcula contra la base.
        z.object({
          productId: z.string(),
          quantity: z.number().int().positive(),
          notes: z.string().optional(),
          optionIds: z.array(z.string()).optional(),
        }),
      ])
    )
    .min(1, "El pedido no puede quedar sin ítems."),
});

export type EditOrderItemsInput = z.infer<typeof editOrderItemsSchema>;

// Estados en los que todavía tiene sentido editar el pedido (sigue en cocina).
const EDITABLE_STATUSES = [
  "PENDING",
  "CONFIRMED",
  "IN_PROGRESS",
  "READY",
];

export async function updateOrderItems(
  orderId: string,
  input: EditOrderItemsInput
): Promise<CreateOrderResult> {
  const existing = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: { include: { options: true } }, payment: true },
  });
  if (!existing) {
    return { ok: false, status: 404, error: "El pedido no existe." };
  }
  if (!EDITABLE_STATUSES.includes(existing.status)) {
    return {
      ok: false,
      status: 409,
      error: "Este pedido ya no se puede editar.",
    };
  }

  let itemsTotal = 0;
  const create: Prisma.OrderItemUncheckedCreateWithoutOrderInput[] = [];
  const fresh: ItemInput[] = [];

  for (const line of input.lines) {
    if ("keepItemId" in line) {
      const item = existing.items.find((it) => it.id === line.keepItemId);
      if (!item) {
        return {
          ok: false,
          status: 400,
          error: "Un ítem del pedido cambió. Refrescá la comanda y probá de nuevo.",
        };
      }
      const optionsPrice = item.options.reduce((s, o) => s + o.price, 0);
      itemsTotal += (item.price + optionsPrice) * line.quantity;
      create.push({
        productId: item.productId ?? undefined,
        productName: item.productName,
        price: item.price,
        quantity: line.quantity,
        notes: item.notes ?? undefined,
        options: {
          create: item.options.map((o) => ({ name: o.name, price: o.price })),
        },
      });
    } else {
      fresh.push(line);
    }
  }

  if (fresh.length > 0) {
    const resolved = await resolveItems(fresh, existing.orderType);
    if (!resolved.ok) return resolved;
    itemsTotal += resolved.itemsTotal;
    create.push(...resolved.create);
  }

  const total = itemsTotal + existing.deliveryFee;

  const order = await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: orderId },
      data: {
        total,
        ...(input.notes !== undefined
          ? { notes: input.notes.trim() || null }
          : {}),
        // Reemplaza todos los ítems: borra los actuales (cascada a sus
        // opciones) y crea el set nuevo.
        items: { deleteMany: {}, create },
      },
    });
    if (existing.payment) {
      // El monto del pago sigue al total. El estado y el "paga con" quedan
      // como estaban (si ya estaba pagado, el local ajusta la diferencia).
      await tx.payment.update({
        where: { orderId },
        data: { amount: total },
      });
    }
    return tx.order.findUniqueOrThrow({
      where: { id: orderId },
      include: orderInclude,
    });
  });

  return { ok: true, order };
}

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

  const resolved = await resolveItems(body.items, body.orderType);
  if (!resolved.ok) return resolved;

  const deliveryFee =
    body.orderType === "DELIVERY" ? settings?.deliveryFee ?? 0 : 0;
  const total = resolved.itemsTotal + deliveryFee;

  // Cliente: se deduplica por teléfono normalizado. Si el pedido no trae un
  // teléfono normalizable (algunas cargas manuales del staff), no se asocia a
  // ningún cliente. El nombre se refresca al más reciente; el email solo se
  // pisa si el pedido trae uno (no borra el guardado).
  const phoneKey = normalizeArPhone(body.customerPhone);
  let customerId: string | undefined;
  if (phoneKey) {
    const customer = await prisma.customer.upsert({
      where: { phone: phoneKey },
      create: {
        phone: phoneKey,
        firstName: body.customerFirstName,
        lastName: body.customerLastName,
        email: body.customerEmail,
      },
      update: {
        firstName: body.customerFirstName,
        lastName: body.customerLastName,
        ...(body.customerEmail ? { email: body.customerEmail } : {}),
      },
      select: { id: true },
    });
    customerId = customer.id;
  }

  const order = await prisma.order.create({
    data: {
      orderType: body.orderType,
      ...(customerId ? { customerId } : {}),
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
      items: { create: resolved.create },
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
