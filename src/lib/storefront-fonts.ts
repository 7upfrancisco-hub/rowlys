// Catálogo curado de tipografías para la carta online — cada local elige una
// desde /admin/configuracion. Curado (no texto libre) para garantizar que
// todas se vean bien y carguen rápido, y para no depender de que el usuario
// sepa el nombre exacto de una fuente de Google Fonts.
//
// Puro (sin `next/font`): lo importa tanto el server (StorefrontTheme, junto
// con storefront-font-loaders.ts) como el cliente (el <select> de
// /admin/configuracion, con preview en vivo cargando el CSS de Google Fonts
// directamente en el navegador — más liviano que traer los 8 loaders al
// bundle del cliente solo para mostrar una lista).

export interface StorefrontFontOption {
  key: string;
  label: string;
  description: string;
  // Nombre tal cual lo espera la URL de Google Fonts (espacios como "+").
  googleFamily: string;
  // Query param "wght@..." de esa misma URL.
  weights: string;
}

export const STOREFRONT_FONT_OPTIONS: StorefrontFontOption[] = [
  {
    key: "inter",
    label: "Inter",
    description: "Moderna y neutra (la de siempre)",
    googleFamily: "Inter",
    weights: "400;500;600;700",
  },
  {
    key: "poppins",
    label: "Poppins",
    description: "Redondeada y amigable",
    googleFamily: "Poppins",
    weights: "400;500;600;700",
  },
  {
    key: "playfair",
    label: "Playfair Display",
    description: "Elegante, estilo bistró",
    googleFamily: "Playfair+Display",
    weights: "400;600;700",
  },
  {
    key: "montserrat",
    label: "Montserrat",
    description: "Geométrica y fuerte",
    googleFamily: "Montserrat",
    weights: "400;600;700",
  },
  {
    key: "quicksand",
    label: "Quicksand",
    description: "Suave y casual",
    googleFamily: "Quicksand",
    weights: "400;500;600;700",
  },
  {
    key: "oswald",
    label: "Oswald",
    description: "Condensada, estilo cartel",
    googleFamily: "Oswald",
    weights: "400;500;600",
  },
  {
    key: "merriweather",
    label: "Merriweather",
    description: "Clásica y cálida",
    googleFamily: "Merriweather",
    weights: "400;700",
  },
  {
    key: "dmsans",
    label: "DM Sans",
    description: "Limpia y minimalista",
    googleFamily: "DM+Sans",
    weights: "400;500;700",
  },
];

export const DEFAULT_STOREFRONT_FONT = "inter";

export function isStorefrontFontKey(key: string | null | undefined): boolean {
  return !!key && STOREFRONT_FONT_OPTIONS.some((f) => f.key === key);
}

export function findStorefrontFont(key?: string | null): StorefrontFontOption {
  return (
    STOREFRONT_FONT_OPTIONS.find((f) => f.key === key) ??
    STOREFRONT_FONT_OPTIONS.find((f) => f.key === DEFAULT_STOREFRONT_FONT)!
  );
}

// URL del stylesheet de Google Fonts para la vista previa en el admin. La
// carta real del cliente NO usa esto — usa next/font (autohosteado, ver
// storefront-font-loaders.ts) para no depender de Google en runtime.
export function googleFontsPreviewHref(key: string): string {
  const font = findStorefrontFont(key);
  return `https://fonts.googleapis.com/css2?family=${font.googleFamily}:wght@${font.weights}&display=swap`;
}
