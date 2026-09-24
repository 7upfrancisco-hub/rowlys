import { prisma } from "@/lib/prisma";
import { renderPwaIcon } from "@/lib/pwa-icon";
import { resolveTenantBySlug } from "@/lib/public-tenant";

// Node.js runtime (no "edge"): usa el mismo PrismaClient que el resto de la
// app, que no corre en Edge.
export const dynamic = "force-dynamic";

// Ícono PNG generado on-the-fly para el manifest de la PWA (192/512), solo
// se usa cuando el local todavía no subió un ícono propio (Settings.iconUrl
// null) — ver src/app/[tenant]/manifest.ts. El query param `tenant` (slug)
// es opcional para no romper llamadas viejas sin él (ej. el ícono de
// respaldo hardcodeado en public/sw.js, que no sabe de qué local es la
// notificación) — sin tenant, cae al mismo "singleton" de siempre.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const size = searchParams.get("size") === "192" ? 192 : 512;
  const tenantSlug = searchParams.get("tenant");

  const tenant = tenantSlug ? await resolveTenantBySlug(tenantSlug) : null;
  const settings = await prisma.settings.findUnique({
    where: tenant ? { tenantId: tenant.id } : { id: "singleton" },
    select: { storeName: true, themeColor: true, themeOnAccent: true },
  });

  return renderPwaIcon(
    size,
    settings?.storeName ?? tenant?.name ?? "Blend",
    settings?.themeColor ?? "#c92a2a",
    settings?.themeOnAccent ?? "white"
  );
}
