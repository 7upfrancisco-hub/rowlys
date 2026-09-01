import { NextResponse } from "next/server";
import { z } from "zod";
import { createOrder, type CreateOrderInput } from "@/lib/orders";

export const dynamic = "force-dynamic";

// Carga manual de un pedido desde /comanda (cliente que pide en el local o por
// teléfono). Protegido por middleware.ts (/api/admin/:path*). A diferencia del
// checkout público: no exige apellido ni teléfono, ignora el estado del local
// (el staff está tomando el pedido de frente) y el pedido nace CONFIRMED.
const staffOrderSchema = z
  .object({
    orderType: z.enum(["PICKUP", "DELIVERY"]),
    customerFirstName: z.string().trim().min(1, "Falta el nombre del cliente."),
    customerLastName: z.string().trim().optional(),
    customerPhone: z.string().trim().optional(),
    deliveryAddress: z.string().trim().min(1).optional(),
    notes: z.string().trim().optional(),
    paymentMethod: z.enum(["CASH", "MP", "MODO", "BANK_TRANSFER"]),
    changeFor: z.number().positive().optional(),
    items: z
      .array(
        z.object({
          productId: z.string(),
          quantity: z.number().int().positive(),
          notes: z.string().trim().optional(),
          optionIds: z.array(z.string()).optional(),
        })
      )
      .min(1, "El pedido no tiene ítems."),
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
  const parsed = staffOrderSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Datos del pedido inválidos." },
      { status: 400 }
    );
  }

  const input: CreateOrderInput = {
    ...parsed.data,
    customerLastName: parsed.data.customerLastName ?? "",
    customerPhone: parsed.data.customerPhone ?? "",
  };

  const result = await createOrder(input, {
    enforceStoreStatus: false,
    initialStatus: "CONFIRMED",
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result.order, { status: 201 });
}
