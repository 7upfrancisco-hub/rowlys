import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// URL absoluta externa o ruta subida por `/api/admin/upload` (Blob o `/uploads/...`).
const imageUrlSchema = z
  .string()
  .trim()
  .refine((v) => /^https?:\/\//.test(v) || v.startsWith("/"), {
    message: "La imagen debe ser una URL válida o una imagen subida.",
  });

const updateProductSchema = z.object({
  name: z.string().trim().min(1).optional(),
  description: z.string().trim().optional(),
  price: z.number().positive().optional(),
  discountPrice: z.number().positive().nullable().optional(),
  imageUrl: imageUrlSchema.nullable().optional(),
  categoryId: z.string().optional(),
  available: z.boolean().optional(),
  availableDelivery: z.boolean().optional(),
  availablePickup: z.boolean().optional(),
  modifierGroupIds: z.array(z.string()).optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const parsed = updateProductSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Datos inválidos." },
      { status: 400 }
    );
  }
  const body = parsed.data;

  const existing = await prisma.product.findUnique({
    where: { id: params.id },
  });
  if (!existing) {
    return NextResponse.json(
      { error: "El producto no existe." },
      { status: 404 }
    );
  }

  const effectivePrice = body.price ?? existing.price;
  const effectiveDiscount =
    body.discountPrice === undefined ? existing.discountPrice : body.discountPrice;
  if (effectiveDiscount !== null && effectiveDiscount >= effectivePrice) {
    return NextResponse.json(
      { error: "El precio con descuento debe ser menor al precio normal." },
      { status: 400 }
    );
  }

  if (body.categoryId) {
    const category = await prisma.category.findUnique({
      where: { id: body.categoryId },
    });
    if (!category) {
      return NextResponse.json(
        { error: "La categoría seleccionada no existe." },
        { status: 400 }
      );
    }
  }

  let groupIds: string[] | undefined;
  if (body.modifierGroupIds) {
    groupIds = [...new Set(body.modifierGroupIds)];
    if (groupIds.length > 0) {
      const groups = await prisma.modifierGroup.findMany({
        where: { id: { in: groupIds }, active: true },
      });
      if (groups.length !== groupIds.length) {
        return NextResponse.json(
          { error: "Alguno de los grupos de adicionales no existe o está inactivo." },
          { status: 400 }
        );
      }
    }
  }

  const { modifierGroupIds: _ignored, ...scalars } = body;

  const product = await prisma.$transaction(async (tx) => {
    const updated = await tx.product.update({
      where: { id: params.id },
      data: scalars,
    });

    if (groupIds) {
      await tx.productModifierGroup.deleteMany({
        where: { productId: params.id },
      });
      await tx.productModifierGroup.createMany({
        data: groupIds.map((groupId, index) => ({
          productId: params.id,
          groupId,
          order: index,
        })),
      });
    }

    return updated;
  });

  return NextResponse.json(product);
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  // Se puede borrar siempre. Los pedidos que incluían este producto conservan
  // el nombre/precio/opciones como snapshot; su `productId` pasa a null
  // (`onDelete: SetNull` en OrderItem). Los grupos de adicionales asignados se
  // borran en cascada.
  try {
    await prisma.product.delete({ where: { id: params.id } });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2025"
    ) {
      return NextResponse.json(
        { error: "El producto no existe." },
        { status: 404 }
      );
    }
    throw err;
  }
}
