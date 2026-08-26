import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const products = await prisma.product.findMany({
    orderBy: { name: "asc" },
    include: {
      category: true,
      modifierGroups: {
        orderBy: { order: "asc" },
        include: { group: { include: { options: true } } },
      },
    },
  });

  const result = products.map((product) => {
    const { modifierGroups, ...rest } = product;
    return {
      ...rest,
      modifierGroups: modifierGroups.map((pmg) => pmg.group),
    };
  });

  return NextResponse.json(result);
}

const productSchema = z
  .object({
    name: z.string().trim().min(1),
    description: z.string().trim().optional(),
    price: z.number().positive(),
    discountPrice: z.number().positive().optional(),
    imageUrl: z.string().trim().url().optional(),
    categoryId: z.string(),
    available: z.boolean().default(true),
    availableDelivery: z.boolean().default(true),
    availablePickup: z.boolean().default(true),
    modifierGroupIds: z.array(z.string()).default([]),
  })
  .refine(
    (data) =>
      data.discountPrice === undefined || data.discountPrice < data.price,
    {
      message: "El precio con descuento debe ser menor al precio normal.",
      path: ["discountPrice"],
    }
  );

export async function POST(request: Request) {
  const parsed = productSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Datos inválidos." },
      { status: 400 }
    );
  }
  const body = parsed.data;

  const category = await prisma.category.findUnique({
    where: { id: body.categoryId },
  });
  if (!category) {
    return NextResponse.json(
      { error: "La categoría seleccionada no existe." },
      { status: 400 }
    );
  }

  const groupIds = [...new Set(body.modifierGroupIds)];
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

  const product = await prisma.product.create({
    data: {
      name: body.name,
      description: body.description,
      price: body.price,
      discountPrice: body.discountPrice,
      imageUrl: body.imageUrl,
      categoryId: body.categoryId,
      available: body.available,
      availableDelivery: body.availableDelivery,
      availablePickup: body.availablePickup,
      modifierGroups: {
        create: groupIds.map((groupId, index) => ({
          groupId,
          order: index,
        })),
      },
    },
    include: { category: true },
  });

  return NextResponse.json(product, { status: 201 });
}
