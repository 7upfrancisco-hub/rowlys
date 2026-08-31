import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const SETTINGS_ID = "singleton";

export async function GET() {
  const settings = await prisma.settings.findUnique({
    where: { id: SETTINGS_ID },
  });
  if (settings) return NextResponse.json(settings);

  return NextResponse.json({
    id: SETTINGS_ID,
    deliveryFee: 0,
    storeName: "Rowlys",
    storePhone: null,
    storeAddress: null,
    bankAlias: null,
    storeOpen: true,
    closedTitle: null,
    closedMessage: null,
    updatedAt: new Date().toISOString(),
  });
}

const settingsSchema = z.object({
  storeName: z.string().trim().min(1),
  storePhone: z.string().trim().optional(),
  storeAddress: z.string().trim().optional(),
  bankAlias: z.string().trim().optional(),
  deliveryFee: z.number().min(0),
  storeOpen: z.boolean().default(true),
  closedTitle: z.string().trim().optional(),
  closedMessage: z.string().trim().optional(),
});

export async function PATCH(request: Request) {
  const parsed = settingsSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Datos inválidos." },
      { status: 400 }
    );
  }
  const body = parsed.data;

  const settings = await prisma.settings.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID, ...body },
    update: body,
  });

  return NextResponse.json(settings);
}
