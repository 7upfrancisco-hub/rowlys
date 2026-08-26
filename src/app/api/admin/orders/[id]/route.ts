import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

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
  })
  .refine((data) => data.status !== undefined || data.markPaid !== undefined, {
    message: "No hay nada para actualizar.",
  });

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const parsed = patchOrderSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Datos inválidos." },
      { status: 400 }
    );
  }
  const { status, markPaid } = parsed.data;

  const existing = await prisma.order.findUnique({
    where: { id: params.id },
    include: { payment: true },
  });
  if (!existing) {
    return NextResponse.json(
      { error: "El pedido no existe." },
      { status: 404 }
    );
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
      if (status) {
        await tx.order.update({ where: { id: params.id }, data: { status } });
      }
      if (markPaid) {
        await tx.payment.update({
          where: { orderId: params.id },
          data: { status: "CONFIRMED" },
        });
      }
      return tx.order.findUniqueOrThrow({
        where: { id: params.id },
        include: { items: { include: { options: true } }, payment: true },
      });
    });
    return NextResponse.json(order);
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
