import { readFileSync } from "fs";
import path from "path";
import { ImageResponse } from "next/og";

// `ImageResponse` sin un `fonts` explícito intenta cargar su fuente default
// desde disco con una lógica de path que en Windows rompe con "Invalid URL"
// (bug conocido de @vercel/og) — se evita pasando nuestra propia fuente. Es
// la misma que Next ya trae para este propósito (node_modules/next/dist/
// compiled/@vercel/og/noto-sans-v27-latin-regular.ttf), copiada acá para no
// depender de una ruta interna de node_modules.
let fontDataCache: Buffer | null = null;
function loadIconFont(): Buffer {
  if (!fontDataCache) {
    fontDataCache = readFileSync(path.join(process.cwd(), "src/lib/fonts/pwa-icon.ttf"));
  }
  return fontDataCache;
}

// Ícono de respaldo para la PWA instalable: la inicial del local sobre su
// color de marca (themeColor/themeOnAccent, los mismos que ya elige en
// /admin/personalizacion). Se usa hasta que el local suba su propio ícono
// (Settings.iconUrl) — así el storefront es instalable desde el día 1, sin
// depender de que alguien cargue un logo primero.
export function renderPwaIcon(
  size: number,
  storeName: string,
  themeColor: string,
  themeOnAccent: string
) {
  const letter = (storeName.trim()[0] ?? "B").toUpperCase();
  const fg = themeOnAccent === "black" ? "#171717" : "#ffffff";

  const response = new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: themeColor,
          color: fg,
          fontSize: size * 0.55,
          fontFamily: "PwaIcon",
        }}
      >
        {letter}
      </div>
    ),
    {
      width: size,
      height: size,
      fonts: [{ name: "PwaIcon", data: loadIconFont(), style: "normal", weight: 400 }],
    }
  );

  // `ImageResponse` pone Cache-Control immutable de 1 año por default,
  // pensado para imágenes que no cambian — pero esta SÍ cambia
  // (storeName/themeColor se editan desde /admin/personalizacion). Pasar
  // `headers` al constructor no reemplaza el default, lo CONCATENA (queda
  // un Cache-Control con dos valores separados por coma, inválido/
  // ambiguo) — hay que reconstruir la Response y usar `.set()`, que sí
  // reemplaza.
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "public, max-age=300, must-revalidate");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
