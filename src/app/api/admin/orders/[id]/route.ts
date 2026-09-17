import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { notifyOrderConfirmed } from "@/lib/notifications/whatsapp";
import { notifyOrderReady } from "@/lib/push";
import { orderInclude } from "@/lib/orders";
import { requireTenantId } from "@/lib/tenant";
import type { WhatsAppSendResult } from "@/types";

export const dynamic = "force-dynamic";

const patchOrderSchema = z
  .object({
    status: z
      .enum([
        "PENDING",
        "CONFIRMED",
        "IN_PROGRESS",
        "READY",
        "DELIVERED",
        "CANCELLED",
      ])
      .optional(),
    markPaid: z.boolean().optional(),
    // string = asignar ese repartidor; null = desasignar.
    driverId: z.string().nullable().optional(),
    // Demora extra en minutos para este pedido (0 = sin demora).
    extraDelayMinutes: z.number().int().min(0).max(240).optional(),
    // Motivo de cancelación. Obligatorio al pasar a CANCELLED (ver refine abajo).
    cancelReason: z.string().trim().min(3).max(300).optional(),
  })
  .refine(
    (data) =>
      data.status !== undefined ||
      data.markPaid !== undefined ||
      data.driverId !== undefined ||
      data.extraDelayMinutes !== undefined,
    { message: "No hay nada para actualizar." }
  )
  .refine(
    (data) => data.status !== "CANCELLED" || !!data.cancelReason,
    {
      message: "Indicá un motivo para cancelar el pedido.",
      path: ["cancelReason"],
    }
  );

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const tenantId = requireTenantId(request);
  const parsed = patchOrderSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Datos inválidos." },
      { status: 400 }
    );
  }
  const { status, markPaid, driverId, extraDelayMinutes, cancelReason } =
    parsed.data;

  const existing = await prisma.order.findFirst({
    where: { id: params.id, tenantId },
    include: { payment: true },
  });
  if (!existing) {
    return NextResponse.json(
      { error: "El pedido no existe." },
      { status: 404 }
    );
  }

  if (driverId) {
    if (existing.orderType !== "DELIVERY") {
      return NextResponse.json(
        { error: "Solo los pedidos de envío llevan repartidor." },
        { status: 400 }
      );
    }
    const driver = await prisma.driver.findFirst({
      where: { id: driverId, tenantId },
    });
    if (!driver) {
      return NextResponse.json(
        { error: "El repartidor no existe." },
        { status: 400 }
      );
    }
  }

  if (markPaid) {
    if (!existing.payment) {
      return NextResponse.json(
        { error: "El pedido no tiene un pago asociado." },
        { status: 400 }
      );
    }
    if (
      existing.payment.provider !== "CASH" &&
      existing.payment.provider !== "BANK_TRANSFER"
    ) {
      return NextResponse.json(
        {
          error:
            "Este medio de pago se confirma automáticamente, no se puede marcar cobrado a mano.",
        },
        { status: 400 }
      );
    }
  }

  try {
    const order = await prisma.$transaction(async (tx) => {
      if (
        status ||
        driverId !== undefined ||
        extraDelayMinutes !== undefined
      ) {
        await tx.order.update({
          where: { id: params.id },
          data: {
            ...(status ? { status } : {}),
            ...(driverId !== undefined ? { driverId } : {}),
            ...(extraDelayMinutes !== undefined ? { extraDelayMinutes } : {}),
            // El motivo solo se guarda junto con la cancelación.
            ...(status === "CANCELLED" ? { cancelReason } : {}),
          },
        });
      }
      if (markPaid) {
        await tx.payment.update({
          where: { orderId: params.id },
          data: { status: "CONFIRMED" },
        });
      }
      return tx.order.findUniqueOrThrow({
        where: { id: params.id },
        include: orderInclude,
      });
    });

    // Aviso automático por WhatsApp SOLO en la transición a Confirmado (no si
    // ya estaba confirmado, para no re-enviar). Nunca hace fallar el PATCH: si
    // el envío falla, el cambio de estado ya quedó guardado igual.
    let whatsappNotification: WhatsAppSendResult | undefined;
    if (status === "CONFIRMED" && existing.status !== "CONFIRMED") {
      const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { slug: true, settings: { select: { storeName: true } } },
      });
      whatsappNotification = await notifyOrderConfirmed(
        {
          id: order.id,
          customerFirstName: order.customerFirstName,
          customerPhone: order.customerPhone,
        },
        tenant?.settings?.storeName ?? "el local",
        tenant?.slug ?? "rowlys"
      ).catch((err): WhatsAppSendResult => {
        console.error("WhatsApp: aviso de confirmación falló:", err);
        return { status: "failed", error: String(err?.message ?? err) };
      });
    }

    // Push del navegador: SOLO en la transición a "Listo" (a pedido
    // explícito del usuario — es el momento en que el cliente realmente
    // tiene que hacer algo, retirarlo o esperar el envío). Se `await`ea (no
    // fire-and-forget) porque una función serverless puede cortarse apenas
    // responde, matando una promesa colgada; internamente nunca tira (mismo
    // criterio que WhatsApp).
    if (status === "READY" && existing.status !== "READY") {
      await notifyOrderReady(order.id, order.orderType, tenantId);
    }

    return NextResponse.json({ ...order, whatsappNotification });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2025"
    ) {
      return NextResponse.json(
        { error: "El pedido no existe." },
        { status: 404 }
      );
    }
    throw err;
  }
}
