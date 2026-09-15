import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Público (sin auth, mismo modelo de confianza que GET /api/orders/[id]: el
// id del pedido es un cuid no adivinable, hace de token). Guarda la
// suscripción push del navegador del cliente que está viendo /pedido/[id],
// para poder avisarle cuando cambie de estado — ver src/lib/push.ts.
const subscribeSchema = z.object({
  endpoint: z.string().trim().url(),
  keys: z.object({
    p256dh: z.string().trim().min(1),
    auth: z.string().trim().min(1),
  }),
});

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const parsed = subscribeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Datos inválidos." },
      { status: 400 }
    );
  }

  const order = await prisma.order.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!order) {
    return NextResponse.json({ error: "Pedido no encontrado." }, { status: 404 });
  }

  const { endpoint, keys } = parsed.data;
  // `endpoint` es único globalmente (identifica navegador+sitio ante el
  // servicio push): si el mismo browser ya se había suscrito antes a otro
  // pedido (o se re-suscribe al mismo), esto pisa esa fila en vez de
  // duplicarla o chocar contra el unique.
  await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: { orderId: order.id, endpoint, p256dh: keys.p256dh, auth: keys.auth },
    update: { orderId: order.id, p256dh: keys.p256dh, auth: keys.auth },
  });

  return NextResponse.json({ ok: true }, { status: 201 });
}

// El cliente puede desactivar las notificaciones desde el mismo botón.
const unsubscribeSchema = z.object({ endpoint: z.string().trim().url() });

export async function DELETE(request: Request) {
  const parsed = unsubscribeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Datos inválidos." },
      { status: 400 }
    );
  }
  await prisma.pushSubscription.deleteMany({ where: { endpoint: parsed.data.endpoint } });
  return NextResponse.json({ ok: true });
}
