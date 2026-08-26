import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const updateGroupSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    type: z.enum(["SINGLE", "MULTIPLE", "REMOVE"]).optional(),
    min: z.number().int().min(0).optional(),
    max: z.number().int().min(0).optional(),
    active: z.boolean().optional(),
    options: z
      .array(
        z.object({
          id: z.string().optional(),
          title: z.string().trim().min(1),
          price: z.number().min(0),
          active: z.boolean().default(true),
        })
      )
      .optional(),
  })
  .refine(
    (data) =>
      data.min === undefined || data.max === undefined || data.min <= data.max,
    { message: "El mínimo no puede ser mayor al máximo.", path: ["min"] }
  );

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const parsed = updateGroupSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Datos inválidos." },
      { status: 400 }
    );
  }
  const { options, ...scalars } = parsed.data;

  const existing = await prisma.modifierGroup.findUnique({
    where: { id: params.id },
    include: { options: true },
  });
  if (!existing) {
    return NextResponse.json(
      { error: "El grupo no existe." },
      { status: 404 }
    );
  }

  const group = await prisma.$transaction(async (tx) => {
    await tx.modifierGroup.update({ where: { id: params.id }, data: scalars });

    if (options) {
      const existingIds = new Set(existing.options.map((o) => o.id));
      const keptIds = new Set(
        options.filter((o) => o.id).map((o) => o.id as string)
      );
      const toDelete = [...existingIds].filter((id) => !keptIds.has(id));
      if (toDelete.length > 0) {
        await tx.modifierOption.deleteMany({ where: { id: { in: toDelete } } });
      }
      for (const option of options) {
        if (option.id) {
          await tx.modifierOption.update({
            where: { id: option.id },
            data: {
              title: option.title,
              price: option.price,
              active: option.active,
            },
          });
        } else {
          await tx.modifierOption.create({
            data: {
              groupId: params.id,
              title: option.title,
              price: option.price,
              active: option.active,
            },
          });
        }
      }
    }

    return tx.modifierGroup.findUniqueOrThrow({
      where: { id: params.id },
      include: { options: true },
    });
  });

  return NextResponse.json(group);
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    await prisma.modifierGroup.delete({ where: { id: params.id } });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2025"
    ) {
      return NextResponse.json(
        { error: "El grupo no existe." },
        { status: 404 }
      );
    }
    throw err;
  }
}
