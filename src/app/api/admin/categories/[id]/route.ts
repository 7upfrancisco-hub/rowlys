import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma, isForeignKeyViolation } from "@/lib/prisma";

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
//  - sin `moveProductsTo`: borra la categoría y, en cascada, sus productos.
//    Si algún producto tiene pedidos registrados, no se puede (409 con la lista).
//  - con `moveProductsTo`: reasigna todos los productos a esa otra categoría y
//    después borra la categoría (ya vacía). No se pierde historial de pedidos.
export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  const moveProductsTo = new URL(request.url).searchParams.get("moveProductsTo");

  const category = await prisma.category.findUnique({
    where: { id: params.id },
    include: { _count: { select: { products: true } } },
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

  try {
    await prisma.category.delete({ where: { id: params.id } });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (isForeignKeyViolation(err)) {
      const blocking = await prisma.product.findMany({
        where: { categoryId: params.id, orderItems: { some: {} } },
        select: { name: true },
      });
      const names = blocking.map((p) => p.name).join(", ");
      return NextResponse.json(
        {
          error:
            `No se puede eliminar: ${
              names || "algún producto de esta categoría"
            } tiene${blocking.length === 1 ? "" : "n"} pedidos registrados. ` +
            "Mové los productos a otra categoría o marcalos como sin stock.",
        },
        { status: 409 }
      );
    }
    throw err;
  }
}
