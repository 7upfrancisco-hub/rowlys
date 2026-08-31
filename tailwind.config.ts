import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Acento del panel interno (admin / comanda): naranja. Sin cambios.
        brand: {
          50: "#fff7ed",
          100: "#ffedd5",
          200: "#fed7aa",
          300: "#fdba74",
          400: "#fb923c",
          500: "#f97316",
          600: "#ea580c",
          700: "#c2410c",
          800: "#9a3412",
          900: "#7c2d12",
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
