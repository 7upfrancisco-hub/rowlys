import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const updateCategorySchema = z.object({
  name: z.string().trim().min(1).optional(),
  order: z.number().int().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const parsed = updateCategorySchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Datos inválidos." },
      { status: 400 }
    );
  }

  try {
    const category = await prisma.category.update({
      where: { id: params.id },
      data: parsed.data,
    });
    return NextResponse.json(category);
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2025"
    ) {
      return NextResponse.json(
        { error: "La categoría no existe." },
        { status: 404 }
      );
    }
    throw err;
  }
}

// DELETE /api/admin/categories/[id]?moveProductsTo=<id>
//  - sin `moveProductsTo`: borra la categoría y, en cascada, sus productos. Los
//    pedidos que incluían esos productos conservan el snapshot (nombre/precio);
//    su `productId` queda en null.
//  - con `moveProductsTo`: reasigna los productos a esa otra categoría y después
//    borra la categoría (ya vacía).
export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  const moveProductsTo = new URL(request.url).searchParams.get("moveProductsTo");

  const category = await prisma.category.findUnique({
    where: { id: params.id },
  });
  if (!category) {
    return NextResponse.json({ error: "La categoría no existe." }, { status: 404 });
  }

  if (moveProductsTo) {
    if (moveProductsTo === params.id) {
      return NextResponse.json(
        { error: "Elegí una categoría distinta para mover los productos." },
        { status: 400 }
      );
    }
    const target = await prisma.category.findUnique({
      where: { id: moveProductsTo },
    });
    if (!target) {
      return NextResponse.json(
        { error: "La categoría de destino no existe." },
        { status: 400 }
      );
    }
    await prisma.$transaction([
      prisma.product.updateMany({
        where: { categoryId: params.id },
        data: { categoryId: moveProductsTo },
      }),
      prisma.category.delete({ where: { id: params.id } }),
    ]);
    return new NextResponse(null, { status: 204 });
  }

  await prisma.category.delete({ where: { id: params.id } });
  return new NextResponse(null, { status: 204 });
}
