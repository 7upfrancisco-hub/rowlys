import { prisma } from "@/lib/prisma";
import { renderPwaIcon } from "@/lib/pwa-icon";

// Node.js runtime (no "edge"): usa el mismo PrismaClient que el resto de la
// app, que no corre en Edge.
export const dynamic = "force-dynamic";

// Ícono PNG generado on-the-fly para el manifest de la PWA (192/512), solo
// se usa cuando el local todavía no subió un ícono propio (Settings.iconUrl
// null) — ver manifest.ts.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const size = searchParams.get("size") === "192" ? 192 : 512;

  const settings = await prisma.settings.findUnique({
    where: { id: "singleton" },
    select: { storeName: true, themeColor: true, themeOnAccent: true },
  });

  return renderPwaIcon(
    size,
    settings?.storeName ?? "Rowlys",
    settings?.themeColor ?? "#c92a2a",
    settings?.themeOnAccent ?? "white"
  );
}
