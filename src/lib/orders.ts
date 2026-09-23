import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { normalizeArPhone } from "@/lib/phone";
import { priceCoupon } from "@/lib/coupons";
import { priceAutomaticDiscounts, type PricingLine } from "@/lib/discount-pricing";
import { pointInPolygon, type LatLng } from "@/lib/geo";
import { isMpAvailableForTenant } from "@/lib/payments/mercadopago";

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
    // Coordenadas del punto elegido en el autocompletar de Google del
    // checkout — se usan para ubicar la dirección real dentro de las zonas
    // de envío del local (ver resolveDeliveryZone). Los pedidos cargados a
    // mano desde /comanda no siempre las tienen (el staff puede tipear
    // cualquier dirección), así que quedan opcionales ahí; sin ellas, un
    // pedido de retiro no las necesita y uno de envío simplemente no se
    // valida contra ninguna zona con polígono.
    deliveryLat: z.number().optional(),
    deliveryLng: z.number().optional(),
    notes: z.string().optional(),
    paymentMethod: z.enum(["CASH", "MP", "BANK_TRANSFER"]),
    changeFor: z.number().positive().optional(),
    couponCode: z.string().trim().optional(),
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

export const orderInclude = {
  items: { include: { options: true } },
  payment: true,
  driver: { select: { id: true, name: true, phone: true } },
  couponRedemption: {
    select: { discountAmount: true, coupon: { select: { code: true } } },
  },
  discountApplications: {
    select: { discountId: true, title: true, amount: true },
  },
} satisfies Prisma.OrderInclude;

export type OrderWithRelations = Prisma.OrderGetPayload<{
  include: typeof orderInclude;
}>;

export type CreateOrderResult =
  | { ok: true; order: OrderWithRelations }
  | { ok: false; status: number; error: string };

// --- Validación + precios de ítems (compartido entre crear y editar) ---------

export interface ItemInput {
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
      pricingLines: PricingLine[];
    }
  | { ok: false; status: number; error: string };

// Revalida cada ítem contra la base (producto existe / disponible en el canal /
// adicionales válidos y dentro de min-max) y arma el `create` anidado con los
// precios recalculados. Nunca confía en lo que manda el cliente.
export async function resolveItems(
  items: ItemInput[],
  orderType: "PICKUP" | "DELIVERY",
  tenantId: string
): Promise<ResolvedItems> {
  const productIds = [...new Set(items.map((i) => i.productId))];
  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, tenantId },
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
    const allOptions = product.modifierGroups.flatMap((pmg) => pmg.group.options);
    const validOptionIds = new Set(allOptions.map((o) => o.id));
    // Un adicional que el local desactivó (ej. se quedaron sin stock) no se
    // puede seleccionar aunque el id exista — si no, un cliente con el menú
    // en caché o un request armado a mano lo cuela en el pedido igual, con
    // precio y todo, contradiciendo que el local lo apagó.
    const activeOptionIds = new Set(allOptions.filter((o) => o.active).map((o) => o.id));
    for (const id of selectedIds) {
      if (!validOptionIds.has(id) || !activeOptionIds.has(id)) {
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
  const pricingLines: PricingLine[] = [];
  const create: Prisma.OrderItemUncheckedCreateWithoutOrderInput[] = items.map((item) => {
    const product = productMap.get(item.productId)!;
    const unitPrice = product.discountPrice ?? product.price;
    const chosenOptions = optionsFor(item.productId, item.optionIds);
    const optionsPrice = chosenOptions.reduce((s, o) => s + o.price, 0);
    itemsTotal += (unitPrice + optionsPrice) * item.quantity;
    pricingLines.push({
      productId: product.id,
      categoryId: product.categoryId,
      quantity: item.quantity,
      unitPrice,
      optionsPricePerUnit: optionsPrice,
    });
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

  return { ok: true, create, itemsTotal, pricingLines };
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
  input: EditOrderItemsInput,
  tenantId: string
): Promise<CreateOrderResult> {
  const existing = await prisma.order.findFirst({
    where: { id: orderId, tenantId },
    include: {
      items: { include: { options: true } },
      payment: true,
      couponRedemption: true,
      discountApplications: { select: { amount: true, kind: true } },
    },
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
    const resolved = await resolveItems(fresh, existing.orderType, tenantId);
    if (!resolved.ok) return resolved;
    itemsTotal += resolved.itemsTotal;
    create.push(...resolved.create);
  }

  // Si el pedido tenía cupón y/o descuentos automáticos, esos montos ya
  // congelados se siguen restando tal cual — editar los ítems no reaplica
  // las reglas contra un total distinto. FREE_SHIPPING queda afuera de esta
  // cuenta porque ya está reflejado en `existing.deliveryFee` (no es un
  // descuento sobre el subtotal de productos). Se filtra por `a.kind`
  // (snapshot propio de la fila) y no por `a.discount?.kind` — la regla
  // original se puede borrar después (onDelete: SetNull en discountId), y
  // ahí `discount` pasa a null silenciosamente sin decir qué tipo era.
  const couponDiscountAmount = existing.couponRedemption?.discountAmount ?? 0;
  const automaticDiscountAmount = existing.discountApplications
    .filter((a) => a.kind !== "FREE_SHIPPING")
    .reduce((s, a) => s + a.amount, 0);
  const total =
    Math.max(0, itemsTotal - couponDiscountAmount - automaticDiscountAmount) +
    existing.deliveryFee;

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
  // Igual criterio que enforceStoreStatus, pero para las zonas de envío: el
  // checkout público rechaza una dirección que cae fuera de todas las zonas
  // con polígono; la carga manual del staff nunca se bloquea por esto (si no
  // matchea ninguna zona, usa la tarifa plana del local sin protestar).
  enforceDeliveryZone: boolean;
  // Un pedido cargado por el staff ya está aceptado.
  initialStatus?: "PENDING" | "CONFIRMED";
  // Tenant dueño del pedido. Lo resuelve siempre el caller: la carga manual
  // admin desde la sesión, el checkout público desde el slug de la URL
  // (Fase 26b-3) — nunca se adivina acá adentro.
  tenantId: string;
}

export type DeliveryFeeResult =
  | { ok: true; fee: number; zoneName: string | null }
  | { ok: false; status: number; error: string };

// Resuelve qué tarifa de envío aplica según la dirección real del cliente:
//  - Sin zonas cargadas para el tenant: tarifa plana de siempre (Settings.deliveryFee).
//  - Con zonas: evalúa las activas en orden; una zona sin polígono matchea
//    cualquier punto (o la ausencia de coordenadas), una zona con polígono
//    solo matchea si el punto cae adentro. Gana la primera que matchea.
//  - Si ninguna matchea y `enforce` es true (checkout público), rechaza el
//    pedido. Si es false (carga manual del staff), cae a la tarifa plana.
export async function resolveDeliveryFee(
  tenantId: string,
  point: LatLng | null,
  flatFee: number,
  enforce: boolean
): Promise<DeliveryFeeResult> {
  const zones = await prisma.deliveryZone.findMany({
    where: { tenantId, enabled: true },
    orderBy: { order: "asc" },
  });
  if (zones.length === 0) {
    return { ok: true, fee: flatFee, zoneName: null };
  }

  for (const zone of zones) {
    const polygon = zone.polygon as unknown as LatLng[] | null;
    if (!polygon || (point && pointInPolygon(point, polygon))) {
      return { ok: true, fee: zone.fee, zoneName: zone.name };
    }
  }

  if (!enforce) {
    return { ok: true, fee: flatFee, zoneName: null };
  }
  return {
    ok: false,
    status: 409,
    error:
      "Tu dirección está fuera de nuestra zona de envío. Probá con retiro en el local.",
  };
}

export async function createOrder(
  body: CreateOrderInput,
  opts: CreateOrderOptions
): Promise<CreateOrderResult> {
  const tenantId = opts.tenantId;
  const settings = await prisma.settings.findUnique({ where: { tenantId } });

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
    // Mismo criterio que deliveryEnabled/pickupEnabled: una pausa de canal
    // que el staff SÍ puede pasar por alto cargando el pedido a mano desde
    // /comanda (por eso va adentro de enforceStoreStatus, a diferencia del
    // chequeo de MP de abajo — ahí no hay forma técnica de cobrar, acá es
    // una decisión del local que el propio local puede saltear).
    if (body.paymentMethod === "CASH" && !settings.cashEnabled) {
      return {
        ok: false,
        status: 409,
        error: "Efectivo no está disponible como medio de pago en este momento.",
      };
    }
    if (body.paymentMethod === "BANK_TRANSFER" && !settings.bankTransferEnabled) {
      return {
        ok: false,
        status: 409,
        error: "La transferencia bancaria no está disponible en este momento.",
      };
    }
  }

  // Rechazo siempre (no solo cuando enforceStoreStatus), incluso en la carga
  // manual desde /comanda: si Mercado Pago no está disponible no hay forma
  // de cobrar ese pedido, no es una situación que el staff pueda pasar por
  // alto como el local cerrado.
  if (body.paymentMethod === "MP" && !(await isMpAvailableForTenant(tenantId))) {
    return {
      ok: false,
      status: 409,
      error: "Mercado Pago no está disponible en este momento. Elegí otro medio de pago.",
    };
  }

  const resolved = await resolveItems(body.items, body.orderType, tenantId);
  if (!resolved.ok) return resolved;

  // Descuentos automáticos (Directo/Combo/Método de pago/Envío gratis):
  // reglas activas del local, se aplican solas, sin que el cliente cargue
  // nada (a diferencia del cupón). Se calculan ANTES del cupón — el cupón
  // se aplica sobre lo que ya quedó del subtotal.
  let baseDeliveryFee = 0;
  let deliveryZoneName: string | null = null;
  if (body.orderType === "DELIVERY") {
    const point =
      body.deliveryLat != null && body.deliveryLng != null
        ? { lat: body.deliveryLat, lng: body.deliveryLng }
        : null;
    const zoneResult = await resolveDeliveryFee(
      tenantId,
      point,
      settings?.deliveryFee ?? 0,
      opts.enforceDeliveryZone
    );
    if (!zoneResult.ok) return zoneResult;
    baseDeliveryFee = zoneResult.fee;
    deliveryZoneName = zoneResult.zoneName;
  }
  // orderBy determinístico: si el admin deja dos reglas DIRECT (o
  // PAYMENT_METHOD) activas sobre el mismo producto/medio de pago, gana
  // siempre la más vieja — antes no había orden y dependía de cómo Postgres
  // devolviera las filas, pudiendo variar entre pedidos idénticos.
  const discountRules = await prisma.discount.findMany({
    where: { tenantId, active: true },
    orderBy: { createdAt: "asc" },
  });
  const automatic = priceAutomaticDiscounts(
    resolved.pricingLines,
    body.orderType,
    body.paymentMethod,
    baseDeliveryFee,
    discountRules
  );

  // Cupón opcional: se valida y se cotiza ANTES de tocar la base (cliente,
  // pedido) — si el código no sirve, no se crea nada. `discountAmount` sale
  // siempre de acá, nunca de lo que mande el cliente. Se cotiza contra el
  // subtotal YA con los descuentos automáticos aplicados.
  let couponPricing: Awaited<ReturnType<typeof priceCoupon>> | null = null;
  if (body.couponCode) {
    couponPricing = await priceCoupon(
      body.couponCode,
      body.customerPhone,
      automatic.itemsTotal,
      tenantId
    );
    if (!couponPricing.ok) return couponPricing;
  }
  const couponDiscountAmount = couponPricing?.ok ? couponPricing.discountAmount : 0;

  const deliveryFee = automatic.deliveryFee;
  const total = Math.max(0, automatic.itemsTotal - couponDiscountAmount) + deliveryFee;

  // Cliente: se deduplica por teléfono normalizado. Si el pedido no trae un
  // teléfono normalizable (algunas cargas manuales del staff), no se asocia a
  // ningún cliente. El nombre se refresca al más reciente; el email solo se
  // pisa si el pedido trae uno (no borra el guardado).
  const phoneKey = normalizeArPhone(body.customerPhone);
  let customerId: string | undefined;
  if (phoneKey) {
    const customer = await prisma.customer.upsert({
      where: { tenantId_phone: { tenantId, phone: phoneKey } },
      create: {
        phone: phoneKey,
        firstName: body.customerFirstName,
        lastName: body.customerLastName,
        email: body.customerEmail,
        tenantId,
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

  const order = await prisma.$transaction(async (tx) => {
    const created = await tx.order.create({
      data: {
        orderType: body.orderType,
        ...(customerId ? { customerId } : {}),
        customerFirstName: body.customerFirstName,
        customerLastName: body.customerLastName,
        customerPhone: body.customerPhone,
        customerEmail: body.customerEmail,
        deliveryAddress:
          body.orderType === "DELIVERY" ? body.deliveryAddress : null,
        deliveryZoneName:
          body.orderType === "DELIVERY" ? deliveryZoneName : null,
        deliveryFee,
        total,
        status: opts.initialStatus ?? "PENDING",
        notes: body.notes,
        tenantId,
        items: { create: resolved.create },
        payment: {
          create: {
            provider: body.paymentMethod,
            amount: total,
            changeFor: body.changeFor,
          },
        },
      },
    });

    if (couponPricing?.ok) {
      await tx.couponRedemption.create({
        data: {
          couponId: couponPricing.coupon.id,
          customerPhone: couponPricing.phoneKey,
          orderId: created.id,
          discountAmount: couponPricing.discountAmount,
        },
      });
    }

    if (automatic.applications.length > 0) {
      await tx.discountApplication.createMany({
        data: automatic.applications.map((a) => ({
          orderId: created.id,
          discountId: a.discountId,
          kind: a.kind,
          title: a.title,
          amount: a.amount,
        })),
      });
    }

    return tx.order.findUniqueOrThrow({
      where: { id: created.id },
      include: orderInclude,
    });
  });

  return { ok: true, order };
}
