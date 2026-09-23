import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { isValidHex, isOnAccentChoice } from "@/lib/theme-color";
import { isStorefrontFontKey } from "@/lib/storefront-fonts";
import { requireTenantId } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const tenantId = requireTenantId(request);
  const [settings, tenant] = await Promise.all([
    prisma.settings.findUnique({ where: { tenantId } }),
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { slug: true } }),
  ]);
  // tenantSlug: para armar links a la carta pública (/<slug>/menu,
  // /<slug>/pedido/<id>) desde /comanda y /admin sin tener que resolverlo de
  // nuevo en cada pantalla.
  if (settings) {
    // mpAccessToken/mpRefreshToken nunca deberían salir del server (están
    // encriptados en reposo, pero no hay motivo para mandar ni el texto
    // cifrado al navegador) — se sacan del spread y se reemplazan por
    // mpOwnConnected, el único dato que la sección "Métodos de pago"
    // necesita mostrar (conectado / no conectado).
    const { mpAccessToken, mpRefreshToken, ...rest } = settings;
    void mpAccessToken;
    void mpRefreshToken;
    return NextResponse.json({
      ...rest,
      tenantSlug: tenant?.slug ?? null,
      mpOwnConnected: !!settings.mpConnectedAt,
    });
  }

  return NextResponse.json({
    tenantId,
    tenantSlug: tenant?.slug ?? null,
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
    mpEnabled: true,
    cashEnabled: true,
    bankTransferEnabled: true,
    mpOwnConnected: false,
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
  mpEnabled: z.boolean().optional(),
  cashEnabled: z.boolean().optional(),
  bankTransferEnabled: z.boolean().optional(),
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
  const [settings] = await prisma.$transaction([
    prisma.settings.upsert({
      where: { tenantId },
      create: { tenantId, storeName: "Mi local", ...body },
      update: body,
    }),
    // Tenant.name y Settings.storeName son dos campos separados: el primero
    // lo carga el super-admin al dar de alta el local (Fase 26c), el segundo
    // lo edita cada local desde acá. Sin este update quedaban
    // desincronizados — el local cambiaba su nombre y /blend-admin (la tabla
    // y la ficha de detalle) seguía mostrando el nombre viejo. Se sincroniza
    // en el mismo `$transaction` que el upsert de Settings para que las dos
    // escrituras salgan o entren juntas.
    ...(body.storeName
      ? [prisma.tenant.update({ where: { id: tenantId }, data: { name: body.storeName } })]
      : []),
  ]);

  // Mismo criterio que el GET: nunca devolver los tokens de MP al navegador.
  const { mpAccessToken, mpRefreshToken, ...rest } = settings;
  void mpAccessToken;
  void mpRefreshToken;
  return NextResponse.json({ ...rest, mpOwnConnected: !!settings.mpConnectedAt });
}
