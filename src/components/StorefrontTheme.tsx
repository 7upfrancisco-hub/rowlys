import { prisma } from "@/lib/prisma";
import { deriveStorefrontTheme } from "@/lib/theme-color";
import { storefrontFontClassName } from "@/lib/storefront-font-loaders";

// Envuelve cualquier página del storefront del cliente (home, /menu,
// /checkout, /pedido/[id]): lee el color de marca y la tipografía que el
// local eligió en /admin/configuracion, y los inyecta como CSS vars + clase
// de fuente en un div ancestro. El contenido interno (los "-client.tsx")
// no cambia nada — sigue usando `text-accent` / `bg-accent-solid` / etc. de
// siempre, definidos en globals.css; acá solo se decide a qué color apuntan
// esas variables para ESTE request.
export default async function StorefrontTheme({
  children,
}: {
  children: React.ReactNode;
}) {
  const settings = await prisma.settings
    .findUnique({
      where: { id: "singleton" },
      select: { themeColor: true, themeFont: true, themeOnAccent: true },
    })
    .catch(() => null);

  const theme = deriveStorefrontTheme(settings?.themeColor, settings?.themeOnAccent);
  const fontClassName = storefrontFontClassName(settings?.themeFont);

  return (
    <div className={fontClassName} style={theme as unknown as React.CSSProperties}>
      {children}
    </div>
  );
}
