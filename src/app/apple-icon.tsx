import { prisma } from "@/lib/prisma";
import { renderPwaIcon } from "@/lib/pwa-icon";

export const dynamic = "force-dynamic";
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// Convención de Next.js: se sirve como apple-touch-icon site-wide. Sin
// esto, "Agregar a pantalla de inicio" en iOS Safari usa una captura de
// pantalla como ícono en vez de un logo — se ve poco profesional.
export default async function AppleIcon() {
  const settings = await prisma.settings.findUnique({
    where: { id: "singleton" },
    select: { storeName: true, themeColor: true, themeOnAccent: true, iconUrl: true },
  });

  if (settings?.iconUrl) {
    // Si el local ya subió su propio ícono, se lo servimos tal cual (iOS
    // sigue la redirección sin problema).
    return Response.redirect(settings.iconUrl);
  }

  return renderPwaIcon(
    180,
    settings?.storeName ?? "Rowlys",
    settings?.themeColor ?? "#c92a2a",
    settings?.themeOnAccent ?? "white"
  );
}
