"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api-client";
import { downscaleImage, uploadImage } from "@/lib/image";
import IconCropper from "@/components/IconCropper";
import ImageCropModal from "@/components/ImageCropModal";
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
  coverImageUrl: string | null;
  iconUrl: string | null;
  footerImageLeftUrl: string | null;
  footerImageRightUrl: string | null;
  footerColor: string | null;
  themeColor: string;
  themeFont: string;
  themeOnAccent: string;
}

export default function PersonalizacionClient() {
  const [storeName, setStoreName] = useState("");
  const [coverImageUrl, setCoverImageUrl] = useState("");
  const [iconUrl, setIconUrl] = useState("");
  const [footerImageLeftUrl, setFooterImageLeftUrl] = useState("");
  const [footerImageRightUrl, setFooterImageRightUrl] = useState("");
  const [footerImageToCrop, setFooterImageToCrop] = useState<{
    file: File;
    side: "left" | "right";
  } | null>(null);
  const [footerColor, setFooterColor] = useState("");
  const [themeColor, setThemeColor] = useState(DEFAULT_THEME_COLOR);
  const [themeFont, setThemeFont] = useState(DEFAULT_STOREFRONT_FONT);
  const [themeOnAccent, setThemeOnAccent] = useState<OnAccentChoice>("white");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState<string | null>(null);
  const [iconToCrop, setIconToCrop] = useState<File | null>(null);

  useEffect(() => {
    apiFetch<ThemeSettings>("/api/admin/settings")
      .then((settings) => {
        setStoreName(settings.storeName);
        setCoverImageUrl(settings.coverImageUrl ?? "");
        setIconUrl(settings.iconUrl ?? "");
        setFooterImageLeftUrl(settings.footerImageLeftUrl ?? "");
        setFooterImageRightUrl(settings.footerImageRightUrl ?? "");
        setFooterColor(settings.footerColor ?? "");
        setThemeColor(settings.themeColor || DEFAULT_THEME_COLOR);
        setThemeFont(settings.themeFont || DEFAULT_STOREFRONT_FONT);
        setThemeOnAccent(
          isOnAccentChoice(settings.themeOnAccent) ? settings.themeOnAccent : "white"
        );
      })
      .catch((err: ApiError) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  async function handleCoverFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite volver a elegir el mismo archivo
    if (!file) return;
    setUploadErr(null);
    setUploading(true);
    try {
      const url = await uploadImage(
        await downscaleImage(file, 1600),
        file.name
      );
      setCoverImageUrl(url);
    } catch (err) {
      setUploadErr((err as Error).message);
    } finally {
      setUploading(false);
    }
  }

  function handleIconFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadErr(null);
    setIconToCrop(file); // abre el editor; la subida real pasa por handleIconCropped
  }

  async function handleIconCropped(blob: Blob) {
    setIconToCrop(null);
    setUploadErr(null);
    setUploading(true);
    try {
      const url = await uploadImage(blob, "icono.webp");
      setIconUrl(url);
    } catch (err) {
      setUploadErr((err as Error).message);
    } finally {
      setUploading(false);
    }
  }

  function handleFooterImageFile(
    side: "left" | "right",
    e: React.ChangeEvent<HTMLInputElement>
  ) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadErr(null);
    setFooterImageToCrop({ file, side }); // abre el editor; la subida pasa por handleFooterImageCropped
  }

  async function handleFooterImageCropped(blob: Blob) {
    const side = footerImageToCrop?.side;
    setFooterImageToCrop(null);
    if (!side) return;
    setUploadErr(null);
    setUploading(true);
    try {
      const url = await uploadImage(blob, `pie-${side}.webp`);
      if (side === "left") setFooterImageLeftUrl(url);
      else setFooterImageRightUrl(url);
    } catch (err) {
      setUploadErr((err as Error).message);
    } finally {
      setUploading(false);
    }
  }

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
          coverImageUrl: coverImageUrl.trim() || null,
          iconUrl: iconUrl.trim() || null,
          footerImageLeftUrl: footerImageLeftUrl.trim() || null,
          footerImageRightUrl: footerImageRightUrl.trim() || null,
          footerColor: isValidHex(footerColor) ? footerColor : null,
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
        Portada, color de marca y tipografía de /menu, /checkout y el
        seguimiento del pedido — para que tu carta se diferencie de la de
        otros locales en Blend.
      </p>
      <form
        onSubmit={handleSubmit}
        className="flex max-w-xl flex-col gap-4 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm"
      >
        <div className="flex flex-col gap-2 border-b border-neutral-100 pb-4">
          <label className="text-sm font-medium text-neutral-700">
            Foto de portada
          </label>
          <p className="-mt-1 text-xs text-neutral-500">
            Banner que se muestra arriba de todo en /menu, atrás del nombre
            del local y el selector de Retiro/Envío.
          </p>
          <div className="flex items-start gap-4">
            {coverImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={coverImageUrl}
                alt=""
                className="h-24 w-40 shrink-0 rounded-lg border border-neutral-200 object-cover"
              />
            ) : (
              <div className="flex h-24 w-40 shrink-0 items-center justify-center rounded-lg border border-dashed border-neutral-300 text-center text-xs text-neutral-400">
                Sin portada
              </div>
            )}
            <div className="flex flex-1 flex-col gap-2">
              <label
                className={
                  "inline-flex w-fit cursor-pointer items-center rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 " +
                  (uploading ? "pointer-events-none opacity-60" : "")
                }
              >
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleCoverFile}
                  className="hidden"
                />
                {uploading
                  ? "Subiendo..."
                  : coverImageUrl
                    ? "Cambiar portada"
                    : "Subir portada"}
              </label>
              {coverImageUrl && (
                <button
                  type="button"
                  onClick={() => setCoverImageUrl("")}
                  className="w-fit text-xs font-medium text-red-600 hover:underline"
                >
                  Quitar portada
                </button>
              )}
              {uploadErr && <p className="text-xs text-red-600">{uploadErr}</p>}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2 border-b border-neutral-100 pb-4">
          <label className="text-sm font-medium text-neutral-700">
            Ícono de la app
          </label>
          <p className="-mt-1 text-xs text-neutral-500">
            Se usa cuando un cliente instala tu carta en la pantalla de
            inicio del celular. Subí una imagen cuadrada — mientras no subas
            una, se genera un ícono automático con la inicial del local
            sobre tu color de marca.
          </p>
          <div className="flex items-start gap-4">
            {iconUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={iconUrl}
                alt=""
                className="h-20 w-20 shrink-0 rounded-xl border border-neutral-200 object-cover"
              />
            ) : (
              <div
                className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl border border-neutral-200 text-2xl font-bold"
                style={{
                  backgroundColor: isValidHex(themeColor) ? themeColor : DEFAULT_THEME_COLOR,
                  color: themeOnAccent === "black" ? "#171717" : "#ffffff",
                }}
              >
                {(storeName.trim()[0] ?? "B").toUpperCase()}
              </div>
            )}
            <div className="flex flex-col gap-2">
              <label
                className={
                  "inline-flex w-fit cursor-pointer items-center rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 " +
                  (uploading ? "pointer-events-none opacity-60" : "")
                }
              >
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleIconFile}
                  className="hidden"
                />
                {uploading ? "Subiendo..." : iconUrl ? "Cambiar ícono" : "Subir ícono"}
              </label>
              {iconUrl && (
                <button
                  type="button"
                  onClick={() => setIconUrl("")}
                  className="w-fit text-xs font-medium text-red-600 hover:underline"
                >
                  Quitar ícono (volver al automático)
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-b border-neutral-100 pb-4">
          <label className="text-sm font-medium text-neutral-700">
            Personajes del pie de página
          </label>
          <p className="-mt-1 text-xs text-neutral-500">
            Se apoyan a cada lado del pie de página de /menu, sobre tu color
            de marca. Subí fotos con fondo transparente (PNG) para que se
            vean recortadas, como un personaje o un producto flotando.
          </p>
          <div className="flex flex-wrap gap-6">
            <FooterImageSlot
              label="Izquierda"
              imageUrl={footerImageLeftUrl}
              themeColor={isValidHex(footerColor) ? footerColor : themeColor}
              uploading={uploading}
              onUpload={(e) => handleFooterImageFile("left", e)}
              onRemove={() => setFooterImageLeftUrl("")}
            />
            <FooterImageSlot
              label="Derecha"
              imageUrl={footerImageRightUrl}
              themeColor={isValidHex(footerColor) ? footerColor : themeColor}
              uploading={uploading}
              onUpload={(e) => handleFooterImageFile("right", e)}
              onRemove={() => setFooterImageRightUrl("")}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1 border-b border-neutral-100 pb-4">
          <label className="text-sm font-medium text-neutral-700">
            Color del pie de página
          </label>
          <p className="-mt-1 text-xs text-neutral-500">
            Por default usa tu color de marca. Elegí otro acá si tu marca
            tiene más de un color característico.
          </p>
          <div className="mt-1 flex items-center gap-2">
            <input
              type="color"
              value={isValidHex(footerColor) ? footerColor : themeColor}
              onChange={(e) => setFooterColor(e.target.value)}
              className="h-10 w-14 cursor-pointer rounded border border-neutral-300 p-1"
            />
            <input
              value={footerColor}
              onChange={(e) => setFooterColor(e.target.value.trim())}
              placeholder={themeColor}
              maxLength={7}
              className="w-28 rounded-lg border border-neutral-300 px-3 py-2 font-mono text-sm focus:border-brand-500 focus:outline-none"
            />
            {footerColor && (
              <button
                type="button"
                onClick={() => setFooterColor("")}
                className="text-xs font-medium text-neutral-500 hover:underline"
              >
                Usar color de marca
              </button>
            )}
          </div>
          {footerColor && !isValidHex(footerColor) && (
            <span className="text-xs text-red-600">
              Formato inválido, usá #rrggbb.
            </span>
          )}
        </div>

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

      {iconToCrop && (
        <IconCropper
          file={iconToCrop}
          onCancel={() => setIconToCrop(null)}
          onConfirm={handleIconCropped}
        />
      )}

      {footerImageToCrop && (
        <ImageCropModal
          file={footerImageToCrop.file}
          onCancel={() => setFooterImageToCrop(null)}
          onConfirm={handleFooterImageCropped}
        />
      )}
    </div>
  );
}

function FooterImageSlot({
  label,
  imageUrl,
  themeColor,
  uploading,
  onUpload,
  onRemove,
}: {
  label: string;
  imageUrl: string;
  themeColor: string;
  uploading: boolean;
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium text-neutral-500">{label}</span>
      <div
        className="flex h-32 w-24 shrink-0 items-end justify-center overflow-hidden rounded-lg border border-neutral-200"
        style={{
          backgroundColor: isValidHex(themeColor) ? themeColor : DEFAULT_THEME_COLOR,
        }}
      >
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt="" className="h-full w-full object-contain" />
        ) : (
          <span className="mb-3 px-2 text-center text-[10px] text-white/70">
            Sin imagen
          </span>
        )}
      </div>
      <label
        className={
          "inline-flex w-fit cursor-pointer items-center rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 " +
          (uploading ? "pointer-events-none opacity-60" : "")
        }
      >
        <input type="file" accept="image/*" onChange={onUpload} className="hidden" />
        {uploading ? "Subiendo..." : imageUrl ? "Cambiar" : "Subir foto"}
      </label>
      {imageUrl && (
        <button
          type="button"
          onClick={onRemove}
          className="w-fit text-xs font-medium text-red-600 hover:underline"
        >
          Quitar
        </button>
      )}
    </div>
  );
}
