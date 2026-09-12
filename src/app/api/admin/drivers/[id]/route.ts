import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireTenantId } from "@/lib/tenant";

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
  const tenantId = requireTenantId(request);
  const parsed = updateDriverSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Datos inválidos." },
      { status: 400 }
    );
  }

  const existing = await prisma.driver.findFirst({
    where: { id: params.id, tenantId },
  });
  if (!existing) {
    return NextResponse.json({ error: "El repartidor no existe." }, { status: 404 });
  }

  const driver = await prisma.driver.update({
    where: { id: params.id },
    data: parsed.data,
  });
  return NextResponse.json(driver);
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  const tenantId = requireTenantId(request);
  // Se puede borrar siempre: los pedidos que lo tenían asignado quedan sin
  // repartidor (`onDelete: SetNull`), no se pierde el pedido.
  const existing = await prisma.driver.findFirst({
    where: { id: params.id, tenantId },
  });
  if (!existing) {
    return NextResponse.json({ error: "El repartidor no existe." }, { status: 404 });
  }
  await prisma.driver.delete({ where: { id: params.id } });
  return new NextResponse(null, { status: 204 });
}
