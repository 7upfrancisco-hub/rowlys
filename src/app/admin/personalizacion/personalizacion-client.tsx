"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api-client";
import {
  DEFAULT_THEME_COLOR,
  ON_ACCENT_CHOICES,
  type OnAccentChoice,
  deriveStorefrontTheme,
  isOnAccentChoice,
  isValidHex,
  suggestOnAccent,
} from "@/lib/theme-color";
import {
  DEFAULT_STOREFRONT_FONT,
  STOREFRONT_FONT_OPTIONS,
  findStorefrontFont,
  googleFontsPreviewHref,
} from "@/lib/storefront-fonts";

// Apartado propio de /admin/configuracion (separado de "Datos del local"):
// solo lo que controla el aspecto visual de la carta online. Comparte la
// misma fila de Settings, pero solo lee/guarda estos 3 campos — así no pisa
// nada de lo que edita la otra pantalla.
interface ThemeSettings {
  storeName: string;
  themeColor: string;
  themeFont: string;
  themeOnAccent: string;
}

export default function PersonalizacionClient() {
  const [storeName, setStoreName] = useState("");
  const [themeColor, setThemeColor] = useState(DEFAULT_THEME_COLOR);
  const [themeFont, setThemeFont] = useState(DEFAULT_STOREFRONT_FONT);
  const [themeOnAccent, setThemeOnAccent] = useState<OnAccentChoice>("white");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch<ThemeSettings>("/api/admin/settings")
      .then((settings) => {
        setStoreName(settings.storeName);
        setThemeColor(settings.themeColor || DEFAULT_THEME_COLOR);
        setThemeFont(settings.themeFont || DEFAULT_STOREFRONT_FONT);
        setThemeOnAccent(
          isOnAccentChoice(settings.themeOnAccent) ? settings.themeOnAccent : "white"
        );
      })
      .catch((err: ApiError) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  // Preview en vivo: misma fórmula que usa el storefront real
  // (src/lib/theme-color.ts), así lo que se ve acá es exactamente lo que va
  // a ver el cliente.
  const preview = useMemo(
    () => deriveStorefrontTheme(themeColor, themeOnAccent),
    [themeColor, themeOnAccent]
  );
  const suggestedOnAccent = useMemo(() => suggestOnAccent(themeColor), [themeColor]);
  const previewFont = findStorefrontFont(themeFont);

  // Carga el CSS de Google Fonts de la tipografía elegida solo para esta
  // vista previa (la carta real del cliente usa next/font, autohosteado).
  useEffect(() => {
    const id = "storefront-font-preview-link";
    let link = document.getElementById(id) as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement("link");
      link.id = id;
      link.rel = "stylesheet";
      document.head.appendChild(link);
    }
    link.href = googleFontsPreviewHref(themeFont);
  }, [themeFont]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setSaving(true);
    try {
      await apiFetch("/api/admin/settings", {
        method: "PATCH",
        body: JSON.stringify({
          themeColor: isValidHex(themeColor) ? themeColor : undefined,
          themeFont,
          themeOnAccent,
        }),
      });
      setSuccess(true);
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-neutral-500">Cargando...</p>;

  return (
    <div>
      <h2 className="mb-1 text-2xl font-bold text-navy-900">Personalización</h2>
      <p className="mb-6 max-w-xl text-sm text-neutral-600">
        Color de marca y tipografía de /menu, /checkout y el seguimiento del
        pedido — para que tu carta se diferencie de la de otros locales en
        Blend.
      </p>
      <form
        onSubmit={handleSubmit}
        className="flex max-w-xl flex-col gap-4 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm"
      >
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-neutral-700">
              Color de marca
            </label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={isValidHex(themeColor) ? themeColor : DEFAULT_THEME_COLOR}
                onChange={(e) => setThemeColor(e.target.value)}
                className="h-10 w-14 cursor-pointer rounded border border-neutral-300 p-1"
              />
              <input
                value={themeColor}
                onChange={(e) => setThemeColor(e.target.value.trim())}
                placeholder="#c92a2a"
                maxLength={7}
                className="w-28 rounded-lg border border-neutral-300 px-3 py-2 font-mono text-sm focus:border-brand-500 focus:outline-none"
              />
            </div>
            {!isValidHex(themeColor) && (
              <span className="text-xs text-red-600">
                Formato inválido, usá #rrggbb.
              </span>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-neutral-700">
              Tipografía
            </label>
            <select
              value={themeFont}
              onChange={(e) => setThemeFont(e.target.value)}
              className="rounded-lg border border-neutral-300 px-3 py-2 focus:border-brand-500 focus:outline-none"
            >
              {STOREFRONT_FONT_OPTIONS.map((f) => (
                <option key={f.key} value={f.key}>
                  {f.label} — {f.description}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-neutral-700">
              Color secundario (texto sobre el color de marca)
            </label>
            <div className="flex w-56 overflow-hidden rounded-lg border border-neutral-300">
              {ON_ACCENT_CHOICES.map((choice) => (
                <button
                  key={choice}
                  type="button"
                  onClick={() => setThemeOnAccent(choice)}
                  className={
                    "flex-1 px-4 py-2 text-center text-sm font-medium transition " +
                    (themeOnAccent === choice
                      ? "bg-brand-600 text-white"
                      : "bg-white text-neutral-600 hover:bg-neutral-50")
                  }
                >
                  {choice === "white" ? "Blanco" : "Negro"}
                </button>
              ))}
            </div>
            <span className="text-xs text-neutral-400">
              Sugerido para este color: {suggestedOnAccent === "white" ? "blanco" : "negro"}.
            </span>
          </div>
        </div>

        {/* Preview: misma fórmula de color que el storefront real. */}
        <div
          className="flex flex-wrap items-center gap-4 rounded-xl border border-neutral-200 p-4"
          style={{ fontFamily: `"${previewFont.label}", sans-serif` }}
        >
          <div className="flex flex-col gap-1">
            <span
              className="text-lg font-bold"
              style={{ color: `rgb(${preview["--s-accent-solid"]})` }}
            >
              {storeName || "Tu local"}
            </span>
            <span className="text-sm text-neutral-500">
              Así se ve tu color y tu tipografía en la carta.
            </span>
          </div>
          <button
            type="button"
            className="rounded-lg px-4 py-2 font-semibold"
            style={{
              backgroundColor: `rgb(${preview["--s-accent-solid"]})`,
              color: `rgb(${preview["--s-on-accent"]})`,
            }}
          >
            Agregar al carrito
          </button>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {success && (
          <p className="text-sm text-green-600">Personalización guardada.</p>
        )}

        <button
          type="submit"
          disabled={saving || !isValidHex(themeColor)}
          className="mt-2 w-fit rounded-lg bg-brand-600 px-4 py-3 font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
        >
          {saving ? "Guardando..." : "Guardar cambios"}
        </button>
      </form>
    </div>
  );
}
