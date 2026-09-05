import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Acento del panel interno (admin / comanda): rojo — color principal
        // de acción (botones, nav activo, links). Aproximado de la paleta
        // Blend (navy + rojo) que pasó el usuario, fondo blanco.
        brand: {
          50: "#fdf1ef",
          100: "#fbdfda",
          200: "#f5c0b6",
          300: "#ec9686",
          400: "#dd6b57",
          500: "#c94631",
          600: "#b3291b",
          700: "#8f2116",
          800: "#721a11",
          900: "#59140d",
        },
        // Acento secundario de Blend: navy — color estructural (títulos,
        // wordmark), no se usa para acciones/botones.
        navy: {
          50: "#f2f4f7",
          100: "#e1e6ed",
          200: "#c3ccda",
          300: "#9ba9c0",
          400: "#6e7f9e",
          500: "#4c5d80",
          600: "#374765",
          700: "#29354c",
          800: "#1e293b",
          900: "#141b29",
        },
        // Acento del storefront del cliente (marca "Rowly'S"): rojo.
        store: {
          50: "#fef2f2",
          100: "#fde2e2",
          200: "#fbcaca",
          300: "#f7a3a3",
          400: "#f06565",
          500: "#e23b3b",
          600: "#c92a2a",
          700: "#a81f1f",
          800: "#8a1c1c",
          900: "#721a1a",
        },
        // Tokens semánticos con CSS vars. En el storefront (`.storefront`) el
        // cliente elige tema oscuro (default) o claro con el toggle — cada tema
        // redefine estas vars en globals.css. Así el mismo `bg-surface` /
        // `text-fg` / `text-accent` sirve para los dos.
        canvas: "rgb(var(--s-canvas) / <alpha-value>)",
        surface: "rgb(var(--s-surface) / <alpha-value>)",
        "surface-2": "rgb(var(--s-surface-2) / <alpha-value>)",
        line: "rgb(var(--s-line) / <alpha-value>)",
        fg: "rgb(var(--s-fg) / <alpha-value>)",
        muted: "rgb(var(--s-muted) / <alpha-value>)",
        accent: "rgb(var(--s-accent) / <alpha-value>)",
      },
    },
  },
  plugins: [],
};
export default config;
