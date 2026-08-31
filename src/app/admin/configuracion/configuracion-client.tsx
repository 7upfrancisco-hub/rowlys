"use client";

import { useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api-client";
import { downscaleImage, uploadImage } from "@/lib/image";

interface Settings {
  storeName: string;
  storePhone: string | null;
  storeAddress: string | null;
  bankAlias: string | null;
  deliveryFee: number;
  storeOpen: boolean;
  closedTitle: string | null;
  closedMessage: string | null;
  closedImageUrl: string | null;
}

export default function ConfiguracionClient() {
  const [storeName, setStoreName] = useState("");
  const [storePhone, setStorePhone] = useState("");
  const [storeAddress, setStoreAddress] = useState("");
  const [bankAlias, setBankAlias] = useState("");
  const [deliveryFee, setDeliveryFee] = useState(0);
  const [storeOpen, setStoreOpen] = useState(true);
  const [closedTitle, setClosedTitle] = useState("");
  const [closedMessage, setClosedMessage] = useState("");
  const [closedImageUrl, setClosedImageUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch<Settings>("/api/admin/settings")
      .then((settings) => {
        setStoreName(settings.storeName);
        setStorePhone(settings.storePhone ?? "");
        setStoreAddress(settings.storeAddress ?? "");
        setBankAlias(settings.bankAlias ?? "");
        setDeliveryFee(settings.deliveryFee);
        setStoreOpen(settings.storeOpen);
        setClosedTitle(settings.closedTitle ?? "");
        setClosedMessage(settings.closedMessage ?? "");
        setClosedImageUrl(settings.closedImageUrl ?? "");
      })
      .catch((err: ApiError) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  async function handleClosedImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const url = await uploadImage(await downscaleImage(file), file.name);
      setClosedImageUrl(url);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setSaving(true);
    try {
      await apiFetch("/api/admin/settings", {
        method: "PATCH",
        body: JSON.stringify({
          storeName,
          storePhone: storePhone.trim() || undefined,
          storeAddress: storeAddress.trim() || undefined,
          bankAlias: bankAlias.trim() || undefined,
          deliveryFee,
          storeOpen,
          closedTitle: closedTitle.trim() || undefined,
          closedMessage: closedMessage.trim() || undefined,
          closedImageUrl: closedImageUrl.trim() || null,
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
      <h2 className="mb-6 text-2xl font-bold text-neutral-900">
        Configuración
      </h2>
      <form
        onSubmit={handleSubmit}
        className="flex max-w-xl flex-col gap-4 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm"
      >
        <div
          className={
            "flex flex-col gap-3 rounded-xl border p-4 " +
            (storeOpen
              ? "border-green-200 bg-green-50"
              : "border-red-200 bg-red-50")
          }
        >
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="font-semibold text-neutral-900">
                {storeOpen ? "Local abierto" : "Local cerrado"}
              </p>
              <p className="text-sm text-neutral-600">
                {storeOpen
                  ? "Los clientes ven el menú normalmente."
                  : "Los clientes ven primero una pantalla de cerrado (pueden entrar al menú igual)."}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={storeOpen}
              onClick={() => setStoreOpen((v) => !v)}
              className={
                "relative h-7 w-12 shrink-0 rounded-full transition " +
                (storeOpen ? "bg-green-500" : "bg-neutral-300")
              }
            >
              <span
                className={
                  "absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition " +
                  (storeOpen ? "left-[22px]" : "left-0.5")
                }
              />
            </button>
          </div>

          {!storeOpen && (
            <div className="flex flex-col gap-3 border-t border-red-200 pt-3">
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-neutral-700">
                  Título del cartel
                </label>
                <input
                  value={closedTitle}
                  onChange={(e) => setClosedTitle(e.target.value)}
                  placeholder="Estamos cerrados"
                  className="rounded-lg border border-neutral-300 px-4 py-2 focus:border-brand-500 focus:outline-none"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-neutral-700">
                  Mensaje (horarios, cuándo vuelven, etc.)
                </label>
                <textarea
                  value={closedMessage}
                  onChange={(e) => setClosedMessage(e.target.value)}
                  rows={3}
                  placeholder="Abrimos de martes a domingo de 20 a 00 hs."
                  className="rounded-lg border border-neutral-300 px-4 py-2 focus:border-brand-500 focus:outline-none"
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-neutral-700">
                  Foto del cartel (opcional)
                </label>
                <div className="flex items-start gap-4">
                  {closedImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={closedImageUrl}
                      alt=""
                      className="h-24 w-32 shrink-0 rounded-lg border border-neutral-200 object-cover"
                    />
                  ) : (
                    <div className="flex h-24 w-32 shrink-0 items-center justify-center rounded-lg border border-dashed border-neutral-300 text-center text-xs text-neutral-400">
                      Sin foto
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
                        onChange={handleClosedImage}
                        className="hidden"
                      />
                      {uploading
                        ? "Subiendo..."
                        : closedImageUrl
                          ? "Cambiar foto"
                          : "Subir foto"}
                    </label>
                    {closedImageUrl && (
                      <button
                        type="button"
                        onClick={() => setClosedImageUrl("")}
                        className="w-fit text-xs font-medium text-red-600 hover:underline"
                      >
                        Quitar foto
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-neutral-700">
            Nombre del local
          </label>
          <input
            value={storeName}
            onChange={(e) => setStoreName(e.target.value)}
            className="rounded-lg border border-neutral-300 px-4 py-2 focus:border-brand-500 focus:outline-none"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-neutral-700">
            Teléfono
          </label>
          <input
            value={storePhone}
            onChange={(e) => setStorePhone(e.target.value)}
            className="rounded-lg border border-neutral-300 px-4 py-2 focus:border-brand-500 focus:outline-none"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-neutral-700">
            Dirección
          </label>
          <input
            value={storeAddress}
            onChange={(e) => setStoreAddress(e.target.value)}
            className="rounded-lg border border-neutral-300 px-4 py-2 focus:border-brand-500 focus:outline-none"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-neutral-700">
            Alias / CBU bancario (para transferencia manual)
          </label>
          <input
            value={bankAlias}
            onChange={(e) => setBankAlias(e.target.value)}
            className="rounded-lg border border-neutral-300 px-4 py-2 focus:border-brand-500 focus:outline-none"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-neutral-700">
            Costo de envío
          </label>
          <input
            type="number"
            step="0.01"
            value={deliveryFee}
            onChange={(e) => setDeliveryFee(Number(e.target.value))}
            className="w-40 rounded-lg border border-neutral-300 px-4 py-2 focus:border-brand-500 focus:outline-none"
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {success && (
          <p className="text-sm text-green-600">Configuración guardada.</p>
        )}

        <button
          type="submit"
          disabled={saving || !storeName.trim()}
          className="mt-2 w-fit rounded-lg bg-brand-600 px-4 py-3 font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
        >
          {saving ? "Guardando..." : "Guardar cambios"}
        </button>
      </form>
    </div>
  );
}
