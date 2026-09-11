// Deriva la paleta del storefront a partir de un único color de marca (hex)
// que cada local elige libremente en /admin/configuracion. Puro (sin deps):
// se usa tanto en el servidor (StorefrontTheme, para inyectar las CSS vars)
// como en el cliente (vista previa en vivo del selector de color).
//
// Por qué derivar en vez de guardar ya calculado: si el local elige un color
// muy claro (amarillo pastel) o muy oscuro, usarlo tal cual como color de
// TEXTO sería ilegible sobre el fondo del storefront, y como fondo de botón
// podría no dar contraste con el texto blanco. Se re-ajusta luminosidad/
// saturación a rangos legibles, conservando siempre el matiz (hue) elegido.

export const DEFAULT_THEME_COLOR = "#c92a2a"; // rojo actual de Rowlys/Blend

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function isValidHex(hex: string | null | undefined): hex is string {
  return !!hex && /^#[0-9a-fA-F]{6}$/.test(hex);
}

type Rgb = [number, number, number];

function hexToRgb(hex: string): Rgb {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHsl([r, g, b]: Rgb): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l * 100];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s * 100, l * 100];
}

function hslToRgb(h: number, s: number, l: number): Rgb {
  h = ((h % 360) + 360) % 360;
  s = clamp(s, 0, 100) / 100;
  l = clamp(l, 0, 100) / 100;
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hueToRgb = (t: number): number => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [
    Math.round(hueToRgb(h / 360 + 1 / 3) * 255),
    Math.round(hueToRgb(h / 360) * 255),
    Math.round(hueToRgb(h / 360 - 1 / 3) * 255),
  ];
}

function channelLuminance(c: number): number {
  const cs = c / 255;
  return cs <= 0.03928 ? cs / 12.92 : Math.pow((cs + 0.055) / 1.055, 2.4);
}

function relativeLuminance([r, g, b]: Rgb): number {
  return (
    0.2126 * channelLuminance(r) +
    0.7152 * channelLuminance(g) +
    0.0722 * channelLuminance(b)
  );
}

// WCAG contrast ratio entre dos colores (1 a 21).
function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a) + 0.05;
  const lb = relativeLuminance(b) + 0.05;
  return la > lb ? la / lb : lb / la;
}

const rgbVar = (rgb: Rgb): string => rgb.join(" ");

const WHITE: Rgb = [255, 255, 255];
const NEAR_BLACK: Rgb = [23, 23, 23];

// El local llama a esto "color secundario": no es un matiz, es elegir a mano
// si el texto/íconos que van SOBRE el color principal (el "+", el texto de
// los botones) son blancos o negros — reemplaza la decisión automática por
// contraste (que sigue siendo el default sugerido cuando no se eligió nada).
export type OnAccentChoice = "white" | "black";
export const ON_ACCENT_CHOICES: OnAccentChoice[] = ["white", "black"];
export function isOnAccentChoice(v: string | null | undefined): v is OnAccentChoice {
  return v === "white" || v === "black";
}

export interface StorefrontThemeVars {
  "--s-accent-light": string;
  "--s-accent-dark": string;
  "--s-accent-solid": string;
  "--s-accent-solid-hover": string;
  "--s-on-accent": string;
}

/**
 * A partir de un color de marca (hex) y, opcionalmente, la elección manual de
 * blanco/negro para el texto de contraste, calcula:
 *  - accentLight / accentDark: mismo matiz, luminosidad fija (42% / 68%) para
 *    que se lea como texto/tinte sobre el fondo claro y sobre el fondo oscuro
 *    del storefront respectivamente. Es la MISMA idea que ya existía
 *    hardcodeada (rojo oscuro en tema claro, rojo claro en tema oscuro), solo
 *    que ahora el matiz sale del color que eligió el local.
 *  - accentSolid / accentSolidHover: color para botones llenos, más cerca del
 *    tono elegido (acotado a un rango donde el botón siga siendo botón, no
 *    texto ni fondo), igual en los dos temas — un botón de marca no cambia
 *    de color al togglear claro/oscuro.
 *  - onAccent ("color secundario" para el local): blanco o negro sobre
 *    accentSolid. Si `onAccentChoice` viene, se respeta tal cual (el local
 *    decide, aunque el contraste no sea ideal). Si no viene, se sugiere
 *    automáticamente el que dé más contraste (protege colores de marca muy
 *    claros, tipo amarillo, donde texto blanco sería ilegible).
 */
export function deriveStorefrontTheme(
  hexInput?: string | null,
  onAccentChoice?: string | null
): StorefrontThemeVars {
  const hex = isValidHex(hexInput) ? hexInput : DEFAULT_THEME_COLOR;
  const [h, s, l] = rgbToHsl(hexToRgb(hex));
  // Solo se fuerza saturación mínima si el color ya tenía algo de color —
  // así una marca en escala de grises (negro/blanco puro) se respeta.
  const sat = s === 0 ? 0 : Math.max(s, 45);

  const accentLight = hslToRgb(h, sat, 46);
  const accentDark = hslToRgb(h, sat, 67);

  const solidL = clamp(l, 30, 56);
  const solid = hslToRgb(h, sat, solidL);
  const solidHover = hslToRgb(h, sat, clamp(solidL + 10, 0, 90));
  const onAccent = isOnAccentChoice(onAccentChoice)
    ? onAccentChoice === "white"
      ? WHITE
      : NEAR_BLACK
    : contrastRatio(WHITE, solid) >= 4.5
      ? WHITE
      : NEAR_BLACK;

  return {
    "--s-accent-light": rgbVar(accentLight),
    "--s-accent-dark": rgbVar(accentDark),
    "--s-accent-solid": rgbVar(solid),
    "--s-accent-solid-hover": rgbVar(solidHover),
    "--s-on-accent": rgbVar(onAccent),
  };
}

// Sugerencia automática (misma fórmula que el fallback de arriba), para que
// el admin pueda preseleccionar el toggle blanco/negro la primera vez que el
// local elige un color, antes de que lo pise a mano.
export function suggestOnAccent(hexInput?: string | null): OnAccentChoice {
  const hex = isValidHex(hexInput) ? hexInput : DEFAULT_THEME_COLOR;
  const [h, s, l] = rgbToHsl(hexToRgb(hex));
  const sat = s === 0 ? 0 : Math.max(s, 45);
  const solid = hslToRgb(h, sat, clamp(l, 30, 56));
  return contrastRatio(WHITE, solid) >= 4.5 ? "white" : "black";
}
