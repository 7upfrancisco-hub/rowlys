import { resolveTenantBySlug } from "@/lib/public-tenant";
import { prisma } from "@/lib/prisma";
import { renderPwaIcon } from "@/lib/pwa-icon";

export const dynamic = "force-dynamic";
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// Convención de Next.js: al vivir en /[tenant]/, se sirve como
// apple-touch-icon para /<slug>/menu, /<slug>/checkout y /<slug>/pedido/[id]
// — cada local con su propio logo, no uno compartido.
export default async function AppleIcon({
  params,
}: {
  params: { tenant: string };
}) {
  const tenant = await resolveTenantBySlug(params.tenant);
  const settings = tenant
    ? await prisma.settings.findUnique({
        where: { tenantId: tenant.id },
        select: { storeName: true, themeColor: true, themeOnAccent: true, iconUrl: true },
      })
    : null;

  if (settings?.iconUrl) {
    // Si el local ya subió su propio ícono, se lo servimos tal cual (iOS
    // sigue la redirección sin problema).
    return Response.redirect(settings.iconUrl);
  }

  return renderPwaIcon(
    180,
    settings?.storeName ?? tenant?.name ?? "Blend",
    settings?.themeColor ?? "#c92a2a",
    settings?.themeOnAccent ?? "white"
  );
}
