import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const groups = await prisma.modifierGroup.findMany({
    orderBy: { name: "asc" },
    include: { options: { orderBy: { title: "asc" } } },
  });
  return NextResponse.json(groups);
}

const createGroupSchema = z
  .object({
    name: z.string().trim().min(1),
    type: z.enum(["SINGLE", "MULTIPLE", "REMOVE"]),
    min: z.number().int().min(0),
    max: z.number().int().min(0),
    active: z.boolean().default(true),
    options: z
      .array(
        z.object({
          title: z.string().trim().min(1),
          price: z.number().min(0),
          active: z.boolean().default(true),
        })
      )
      .min(1),
  })
  .refine((data) => data.min <= data.max, {
    message: "El mínimo no puede ser mayor al máximo.",
    path: ["min"],
  });

export async function POST(request: Request) {
  const parsed = createGroupSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Datos inválidos." },
      { status: 400 }
    );
  }
  const body = parsed.data;

  const group = await prisma.modifierGroup.create({
    data: {
      name: body.name,
      type: body.type,
      min: body.min,
      max: body.max,
      active: body.active,
      options: { create: body.options },
    },
    include: { options: true },
  });

  return NextResponse.json(group, { status: 201 });
}
