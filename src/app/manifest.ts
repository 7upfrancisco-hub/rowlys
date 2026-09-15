import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";

// Sin esto, Next intenta generar el manifest como estático en build time (y
// falla si la base no está disponible ahí) — además horneraría el
// storeName/themeColor de ESE momento para siempre, ignorando cambios
// posteriores desde /admin/personalizacion.
export const dynamic = "force-dynamic";

// Convención de Next.js: este archivo se sirve solo en /manifest.webmanifest
// y Next lo enlaza automáticamente (<link rel="manifest">) en TODAS las
// páginas de la app. Es inofensivo en /admin y /comanda (quedan atrás de
// login igual) — de hecho instalar /comanda como PWA en una tablet de
// cocina es un plus, no un problema. `start_url` apunta al storefront del
// cliente, que es el caso de uso principal.
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const settings = await prisma.settings.findUnique({
    where: { id: "singleton" },
    select: { storeName: true, themeColor: true, iconUrl: true },
  });

  const storeName = settings?.storeName ?? "Rowlys";
  const themeColor = settings?.themeColor ?? "#c92a2a";
  // Mientras el local no suba su propio ícono (Settings.iconUrl), se usa el
  // generado automático (ver /api/pwa-icon) — misma URL para 192 y 512
  // porque no tenemos el archivo en ambos tamaños exactos; los navegadores
  // lo escalan sin problema.
  const icon192 = settings?.iconUrl ?? "/api/pwa-icon?size=192";
  const icon512 = settings?.iconUrl ?? "/api/pwa-icon?size=512";

  return {
    name: `${storeName} | Pedidos online`,
    short_name: storeName,
    description: "Pedí online para retiro o delivery",
    start_url: "/menu",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: themeColor,
    icons: [
      { src: icon192, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: icon512, sizes: "512x512", type: "image/png", purpose: "any" },
      { src: icon512, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
