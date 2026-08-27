import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createPreference } from "@/lib/payments/mercadopago";

export const dynamic = "force-dynamic";

// Publico (sin auth): lo llama el checkout del cliente despues de crear el
// pedido, para obtener el link de pago de Mercado Pago. El id del pedido (cuid)
// no es adivinable; el monto se toma de la DB, nunca del cliente. Tambien lo usa
// /pedido/[id] para reintentar el pago si quedo pendiente.
const bodySchema = z.object({ orderId: z.string().min(1) });

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Falta orderId." }, { status: 400 });
  }

  const order = await prisma.order.findUnique({
    where: { id: parsed.data.orderId },
    include: { payment: true },
  });
  if (!order || !order.payment) {
    return NextResponse.json({ error: "Pedido no encontrado." }, { status: 404 });
  }
  if (order.payment.provider !== "MP") {
    return NextResponse.json(
      { error: "Este pedido no se paga con Mercado Pago." },
      { status: 400 }
    );
  }
  if (order.payment.status === "CONFIRMED") {
    return NextResponse.json(
      { error: "Este pedido ya esta pagado.", alreadyPaid: true },
      { status: 409 }
    );
  }

  try {
    const pref = await createPreference({
      orderId: order.id,
      total: order.total,
      description: `Pedido ${order.id.slice(-6).toUpperCase()} · ${order.customerFirstName} ${order.customerLastName}`,
      payer: {
        name: order.customerFirstName,
        surname: order.customerLastName,
        email: order.customerEmail ?? undefined,
      },
    });

    await prisma.payment.update({
      where: { orderId: order.id },
      data: { providerRef: pref.id },
    });

    return NextResponse.json({ initPoint: pref.initPoint });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "No se pudo iniciar el pago con Mercado Pago.",
      },
      { status: 502 }
    );
  }
}
