"use client";

import { useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api-client";

interface Settings {
  storeName: string;
  storePhone: string | null;
  storeAddress: string | null;
  bankAlias: string | null;
  deliveryFee: number;
}

export default function ConfiguracionClient() {
  const [storeName, setStoreName] = useState("");
  const [storePhone, setStorePhone] = useState("");
  const [storeAddress, setStoreAddress] = useState("");
  const [bankAlias, setBankAlias] = useState("");
  const [deliveryFee, setDeliveryFee] = useState(0);
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
      })
      .catch((err: ApiError) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

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
