import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireTenantId } from "@/lib/tenant";

export const dynamic = "force-dynamic";

const pointSchema = z.object({ lat: z.number(), lng: z.number() });

const updateZoneSchema = z.object({
  name: z.string().trim().min(1).optional(),
  fee: z.number().min(0).optional(),
  enabled: z.boolean().optional(),
  order: z.number().optional(),
  polygon: z.array(pointSchema).min(3).nullable().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const tenantId = requireTenantId(request);
  const parsed = updateZoneSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Datos inválidos." },
      { status: 400 }
    );
  }

  const existing = await prisma.deliveryZone.findFirst({
    where: { id: params.id, tenantId },
  });
  if (!existing) {
    return NextResponse.json({ error: "La zona no existe." }, { status: 404 });
  }

  const { polygon, ...rest } = parsed.data;
  const zone = await prisma.deliveryZone.update({
    where: { id: params.id },
    data: {
      ...rest,
      // Json? nullable: para dejarlo en NULL de verdad (zona sin
      // restricción) hay que pasar Prisma.DbNull explícito, `null` a secas
      // no tipa contra un campo Json.
      ...(polygon !== undefined
        ? { polygon: polygon === null ? Prisma.DbNull : polygon }
        : {}),
    },
  });
  return NextResponse.json(zone);
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  const tenantId = requireTenantId(request);
  const existing = await prisma.deliveryZone.findFirst({
    where: { id: params.id, tenantId },
  });
  if (!existing) {
    return NextResponse.json({ error: "La zona no existe." }, { status: 404 });
  }
  await prisma.deliveryZone.delete({ where: { id: params.id } });
  return new NextResponse(null, { status: 204 });
}
