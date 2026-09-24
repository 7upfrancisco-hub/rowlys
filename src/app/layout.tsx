import type { Metadata } from "next";
import "./globals.css";

// Título de respaldo para cualquier página sin el suyo propio (/admin,
// /comanda, /login, /blend-admin, /) — Blend es la marca de la plataforma,
// no la de ningún local. Las páginas públicas de cada tenant (menú,
// checkout, pedido) pisan esto con el nombre real del local en su propio
// generateMetadata; acá abajo, "Blend" es lo correcto siempre.
export const metadata: Metadata = {
  title: "Blend",
  description: "Menú digital y comanda para locales gastronómicos",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default" },
};

// Aplica el tema del storefront elegido por el cliente ANTES del primer paint,
// para que no haya un flash de tema oscuro cuando eligió claro (o al revés).
// Solo toca <html data-store-theme>; el CSS de `.storefront` hace el resto.
const THEME_INIT = `try{var t=localStorage.getItem('rowlys-theme');if(t==='light'||t==='dark')document.documentElement.dataset.storeTheme=t}catch(e){}`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
        {children}
      </body>
    </html>
  );
}
