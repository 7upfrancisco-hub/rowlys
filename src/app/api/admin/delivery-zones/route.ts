import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireTenantId } from "@/lib/tenant";

export const dynamic = "force-dynamic";

const pointSchema = z.object({ lat: z.number(), lng: z.number() });

export async function GET(request: Request) {
  const tenantId = requireTenantId(request);
  const zones = await prisma.deliveryZone.findMany({
    where: { tenantId },
    orderBy: { order: "asc" },
  });
  return NextResponse.json(zones);
}

const createZoneSchema = z.object({
  name: z.string().trim().min(1),
  fee: z.number().min(0),
  enabled: z.boolean().default(true),
  // null/undefined = zona sin restricción geográfica (matchea cualquier
  // dirección). Si se manda, hace falta un polígono cerrable (mínimo 3 puntos).
  polygon: z.array(pointSchema).min(3).nullable().optional(),
});

export async function POST(request: Request) {
  const tenantId = requireTenantId(request);
  const parsed = createZoneSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Datos inválidos." },
      { status: 400 }
    );
  }
  const body = parsed.data;

  const last = await prisma.deliveryZone.findFirst({
    where: { tenantId },
    orderBy: { order: "desc" },
    select: { order: true },
  });

  const zone = await prisma.deliveryZone.create({
    data: {
      name: body.name,
      fee: body.fee,
      enabled: body.enabled,
      polygon: body.polygon ?? undefined,
      order: (last?.order ?? -10) + 10,
      tenantId,
    },
  });
  return NextResponse.json(zone, { status: 201 });
}
