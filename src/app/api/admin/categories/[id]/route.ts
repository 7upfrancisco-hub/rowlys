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

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    await prisma.category.delete({ where: { id: params.id } });
    return new NextResponse(null, { status: 204 });
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
    if (isForeignKeyViolation(err)) {
      return NextResponse.json(
        {
          error:
            "No se puede eliminar: hay productos de esta categoría con pedidos registrados. Deshabilitalos en vez de borrarlos.",
        },
        { status: 409 }
      );
    }
    throw err;
  }
}
