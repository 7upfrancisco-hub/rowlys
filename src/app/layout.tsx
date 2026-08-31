import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rowlys | Pedidos online",
  description: "Menú digital y comanda para locales gastronómicos",
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
