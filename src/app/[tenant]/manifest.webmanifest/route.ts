import { NextResponse } from "next/server";
import { resolveTenantBySlug } from "@/lib/public-tenant";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Manifest POR LOCAL (Fase 26b-3), servido a mano como route handler: la
// convención de archivo especial `manifest.ts` de Next no genera nada
// dentro de un segmento dinámico como /[tenant]/ (probado — devuelve 404),
// así que se arma acá con el mismo shape que produciría esa convención.
// Sirve en /<slug>/manifest.webmanifest y hay que enlazarlo a mano (ver
// StorefrontTheme/head de cada página) en vez de depender del auto-link de
// Next.
export async function GET(
  request: Request,
  { params }: { params: { tenant: string } }
) {
  const tenant = await resolveTenantBySlug(params.tenant);
  const settings = tenant
    ? await prisma.settings.findUnique({
        where: { tenantId: tenant.id },
        select: { storeName: true, themeColor: true, iconUrl: true },
      })
    : null;

  const storeName = settings?.storeName ?? tenant?.name ?? "Blend";
  const themeColor = settings?.themeColor ?? "#c92a2a";
  const icon192 = settings?.iconUrl ?? `/api/pwa-icon?size=192&tenant=${params.tenant}`;
  const icon512 = settings?.iconUrl ?? `/api/pwa-icon?size=512&tenant=${params.tenant}`;

  return NextResponse.json({
    name: `${storeName} | Pedidos online`,
    short_name: storeName,
    description: "Pedí online para retiro o delivery",
    start_url: `/${params.tenant}/menu`,
    display: "standalone",
    background_color: "#ffffff",
    theme_color: themeColor,
    icons: [
      { src: icon192, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: icon512, sizes: "512x512", type: "image/png", purpose: "any" },
      { src: icon512, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  });
}
