"use client";

import { useEffect, useState } from "react";

// Toggle de tema del storefront (oscuro por defecto / claro). Guarda la
// elección en localStorage y la aplica poniendo `data-store-theme` en <html>
// (el mismo atributo que setea el script inline de layout.tsx antes del primer
// paint, para que no haya flash al recargar).

type Theme = "dark" | "light";

function currentTheme(): Theme {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.dataset.storeTheme === "light"
    ? "light"
    : "dark";
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("dark");

  // Sincroniza con lo que ya dejó el script inline (evita el parpadeo).
  useEffect(() => setTheme(currentTheme()), []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.storeTheme = next;
    try {
      localStorage.setItem("rowlys-theme", next);
    } catch {
      /* modo incógnito / storage bloqueado: se pierde la preferencia, no rompe */
    }
  }

  const goingToDark = theme === "light";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={goingToDark ? "Cambiar a tema oscuro" : "Cambiar a tema claro"}
      title={goingToDark ? "Tema oscuro" : "Tema claro"}
      className="fixed right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-line bg-surface text-fg shadow-sm transition hover:bg-surface-2"
    >
      {goingToDark ? (
        // ícono luna (paso a oscuro)
        <svg
          viewBox="0 0 24 24"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      ) : (
        // ícono sol (paso a claro)
        <svg
          viewBox="0 0 24 24"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
      )}
    </button>
  );
}
