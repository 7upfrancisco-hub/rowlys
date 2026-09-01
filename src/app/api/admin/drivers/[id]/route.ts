import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const updateDriverSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    phone: z.string().trim().min(1).optional(),
    vehicle: z.string().trim().nullable().optional(),
    licensePlate: z.string().trim().nullable().optional(),
    documentId: z.string().trim().nullable().optional(),
    address: z.string().trim().nullable().optional(),
    notes: z.string().trim().nullable().optional(),
    active: z.boolean().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, {
    message: "No hay nada para actualizar.",
  });

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const parsed = updateDriverSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Datos inválidos." },
      { status: 400 }
    );
  }

  try {
    const driver = await prisma.driver.update({
      where: { id: params.id },
      data: parsed.data,
    });
    return NextResponse.json(driver);
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2025"
    ) {
      return NextResponse.json(
        { error: "El repartidor no existe." },
        { status: 404 }
      );
    }
    throw err;
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  // Se puede borrar siempre: los pedidos que lo tenían asignado quedan sin
  // repartidor (`onDelete: SetNull`), no se pierde el pedido.
  try {
    await prisma.driver.delete({ where: { id: params.id } });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2025"
    ) {
      return NextResponse.json(
        { error: "El repartidor no existe." },
        { status: 404 }
      );
    }
    throw err;
  }
}
