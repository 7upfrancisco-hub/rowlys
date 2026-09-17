import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { isValidHex, isOnAccentChoice } from "@/lib/theme-color";
import { isStorefrontFontKey } from "@/lib/storefront-fonts";
import { requireTenantId } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const tenantId = requireTenantId(request);
  const settings = await prisma.settings.findUnique({ where: { tenantId } });
  if (settings) return NextResponse.json(settings);

  return NextResponse.json({
    tenantId,
    deliveryFee: 0,
    storeName: "Rowlys",
    storePhone: null,
    storeAddress: null,
    instagramHandle: null,
    tiktokHandle: null,
    bankAlias: null,
    storeOpen: true,
    deliveryEnabled: true,
    pickupEnabled: true,
    closedTitle: null,
    closedMessage: null,
    closedImageUrl: null,
    prepTimeDeliveryMinutes: 10,
    prepTimePickupMinutes: 10,
    coverImageUrl: null,
    iconUrl: null,
    footerImageLeftUrl: null,
    footerImageRightUrl: null,
    footerColor: null,
    themeColor: "#c92a2a",
    themeFont: "inter",
    themeOnAccent: "white",
    updatedAt: new Date().toISOString(),
  });
}

// Todos los campos son opcionales: el form de /admin/configuracion los manda
// todos, pero el header de /comanda hace PATCH parciales de un solo toggle.
const settingsSchema = z.object({
  storeName: z.string().trim().min(1).optional(),
  storePhone: z.string().trim().optional(),
  storeAddress: z.string().trim().optional(),
  instagramHandle: z.string().trim().optional(),
  tiktokHandle: z.string().trim().optional(),
  bankAlias: z.string().trim().optional(),
  deliveryFee: z.number().min(0).optional(),
  storeOpen: z.boolean().optional(),
  deliveryEnabled: z.boolean().optional(),
  pickupEnabled: z.boolean().optional(),
  closedTitle: z.string().trim().optional(),
  closedMessage: z.string().trim().optional(),
  closedImageUrl: z.string().trim().nullable().optional(),
  prepTimeDeliveryMinutes: z.number().int().min(0).max(240).optional(),
  prepTimePickupMinutes: z.number().int().min(0).max(240).optional(),
  coverImageUrl: z.string().trim().nullable().optional(),
  iconUrl: z.string().trim().nullable().optional(),
  footerImageLeftUrl: z.string().trim().nullable().optional(),
  footerImageRightUrl: z.string().trim().nullable().optional(),
  footerColor: z
    .string()
    .trim()
    .nullable()
    .refine((v) => v == null || isValidHex(v), "Color inválido (usá formato #rrggbb).")
    .optional(),
  themeColor: z
    .string()
    .trim()
    .refine(isValidHex, "Color inválido (usá formato #rrggbb).")
    .optional(),
  themeFont: z
    .string()
    .trim()
    .refine(isStorefrontFontKey, "Tipografía inválida.")
    .optional(),
  themeOnAccent: z
    .string()
    .trim()
    .refine(isOnAccentChoice, "El color secundario es blanco o negro.")
    .optional(),
});

export async function PATCH(request: Request) {
  const tenantId = requireTenantId(request);
  const parsed = settingsSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Datos inválidos." },
      { status: 400 }
    );
  }
  const body = parsed.data;

  // storeName es obligatorio al CREAR la fila (no tiene default razonable);
  // si todavía no existe Settings para este tenant y el PATCH no lo manda
  // (ej. el toggle suelto del header de /comanda), usamos "Mi local" en vez
  // de fallar — se corrige después desde /admin/configuracion.
  const settings = await prisma.settings.upsert({
    where: { tenantId },
    create: { tenantId, storeName: "Mi local", ...body },
    update: body,
  });

  return NextResponse.json(settings);
}
