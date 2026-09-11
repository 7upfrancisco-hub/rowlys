// Server-only: autohostea las 8 tipografías curadas con `next/font/google`
// (se bajan una vez en build y se sirven desde el propio dominio, sin pegarle
// a Google en runtime ni meter un <link> externo). Separado de
// storefront-fonts.ts (la lista "pura") para no arrastrar los 8 loaders al
// bundle del cliente — esto solo lo importa StorefrontTheme.tsx.
import {
  Inter,
  Poppins,
  Playfair_Display,
  Montserrat,
  Quicksand,
  Oswald,
  Merriweather,
  DM_Sans,
} from "next/font/google";
import { DEFAULT_STOREFRONT_FONT } from "./storefront-fonts";

const inter = Inter({ subsets: ["latin"], display: "swap" });
const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});
const playfair = Playfair_Display({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  display: "swap",
});
const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  display: "swap",
});
const quicksand = Quicksand({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});
const oswald = Oswald({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});
const merriweather = Merriweather({
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
});
const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap",
});

const LOADERS: Record<string, { className: string }> = {
  inter,
  poppins,
  playfair,
  montserrat,
  quicksand,
  oswald,
  merriweather,
  dmsans: dmSans,
};

export function storefrontFontClassName(key?: string | null): string {
  return (LOADERS[key ?? ""] ?? LOADERS[DEFAULT_STOREFRONT_FONT]).className;
}
