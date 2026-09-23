"use client";

import { useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api-client";

interface Settings {
  bankAlias: string | null;
  mpEnabled: boolean;
  cashEnabled: boolean;
  bankTransferEnabled: boolean;
  // Si el local conectó su propia cuenta de Mercado Pago (OAuth desde
  // /blend-admin — acá es solo lectura, conectar sigue siendo cosa del
  // super-admin de Blend). No confundir con mpEnabled: se puede tener la
  // cuenta conectada y el toggle apagado (o viceversa, todavía sin conectar
  // pero prendido — en ese caso el checkout cae al token global si hay uno).
  mpOwnConnected: boolean;
}

function Toggle({
  on,
  onClick,
  label,
}: {
  on: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onClick}
      className={
        "relative h-7 w-12 shrink-0 rounded-full transition " +
        (on ? "bg-green-500" : "bg-neutral-300")
      }
    >
      <span
        className={
          "absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition " +
          (on ? "left-[22px]" : "left-0.5")
        }
      />
    </button>
  );
}

export default function MetodosPagoClient() {
  const [cashEnabled, setCashEnabled] = useState(true);
  const [mpEnabled, setMpEnabled] = useState(true);
  const [mpOwnConnected, setMpOwnConnected] = useState(false);
  const [bankTransferEnabled, setBankTransferEnabled] = useState(true);
  const [bankAlias, setBankAlias] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch<Settings>("/api/admin/settings")
      .then((settings) => {
        setCashEnabled(settings.cashEnabled);
        setMpEnabled(settings.mpEnabled);
        setMpOwnConnected(settings.mpOwnConnected);
        setBankTransferEnabled(settings.bankTransferEnabled);
        setBankAlias(settings.bankAlias ?? "");
      })
      .catch((err: ApiError) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  async function save(
    patch: Record<string, unknown>,
    optimistic: () => void,
    revert: () => void
  ) {
    setError(null);
    setSuccess(false);
    optimistic();
    try {
      await apiFetch("/api/admin/settings", {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      setSuccess(true);
    } catch (err) {
      revert();
      setError((err as ApiError).message);
    }
  }

  async function handleAliasSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setSaving(true);
    try {
      await apiFetch("/api/admin/settings", {
        method: "PATCH",
        body: JSON.stringify({ bankAlias: bankAlias.trim() || undefined }),
      });
      setSuccess(true);
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setSaving(false);
    }
  }

  const noneEnabled = !cashEnabled && !mpEnabled && !bankTransferEnabled;

  if (loading) return <p className="text-neutral-500">Cargando...</p>;

  return (
    <div>
      <h2 className="mb-2 text-2xl font-bold text-navy-900">
        Métodos de pago
      </h2>
      <p className="mb-6 max-w-xl text-sm text-neutral-500">
        Prendé o apagá cada medio de pago del checkout público. Un medio
        apagado deja de ofrecerse a los clientes al momento, aunque esté
        configurado.
      </p>

      {noneEnabled && (
        <p className="mb-4 max-w-xl rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          Apagaste los tres medios de pago: los clientes no van a poder
          confirmar ningún pedido hasta que prendas al menos uno.
        </p>
      )}
      {error && (
        <p className="mb-4 max-w-xl rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}
      {success && (
        <p className="mb-4 max-w-xl text-sm text-green-600">
          Configuración guardada.
        </p>
      )}

      <div className="flex max-w-xl flex-col gap-4">
        <div className="flex items-center justify-between gap-4 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
          <div>
            <p className="font-semibold text-neutral-900">Efectivo</p>
            <p className="text-sm text-neutral-500">
              {cashEnabled
                ? "El checkout lo ofrece como medio de pago."
                : "Apagado: no se muestra como opción en el checkout."}
            </p>
          </div>
          <Toggle
            label="Efectivo"
            on={cashEnabled}
            onClick={() => {
              const next = !cashEnabled;
              save(
                { cashEnabled: next },
                () => setCashEnabled(next),
                () => setCashEnabled(!next)
              );
            }}
          />
        </div>

        <div className="flex flex-col gap-3 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="font-semibold text-neutral-900">Mercado Pago</p>
              <p className="text-sm text-neutral-500">
                {mpEnabled
                  ? "El checkout lo ofrece como medio de pago (si está conectado)."
                  : "Apagado: no se muestra como opción en el checkout, aunque esté conectado."}
              </p>
            </div>
            <Toggle
              label="Mercado Pago"
              on={mpEnabled}
              onClick={() => {
                const next = !mpEnabled;
                save(
                  { mpEnabled: next },
                  () => setMpEnabled(next),
                  () => setMpEnabled(!next)
                );
              }}
            />
          </div>
          <p
            className={
              "w-fit rounded-full px-3 py-1 text-xs font-medium " +
              (mpOwnConnected
                ? "bg-green-100 text-green-700"
                : "bg-neutral-100 text-neutral-500")
            }
          >
            {mpOwnConnected
              ? "Cuenta de Mercado Pago conectada"
              : "Todavía no conectaste tu cuenta de Mercado Pago"}
          </p>
          {!mpOwnConnected && (
            <p className="text-xs text-neutral-400">
              La conexión con Mercado Pago la hace Blend desde su panel — si
              todavía no la conectaste, pedísela.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-3 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="font-semibold text-neutral-900">
                Transferencia bancaria manual
              </p>
              <p className="text-sm text-neutral-500">
                {bankTransferEnabled
                  ? "El checkout la ofrece cuando Mercado Pago está apagado o no está conectado."
                  : "Apagada: si Mercado Pago tampoco está disponible, el cliente no ve esta opción."}
              </p>
            </div>
            <Toggle
              label="Transferencia bancaria manual"
              on={bankTransferEnabled}
              onClick={() => {
                const next = !bankTransferEnabled;
                save(
                  { bankTransferEnabled: next },
                  () => setBankTransferEnabled(next),
                  () => setBankTransferEnabled(!next)
                );
              }}
            />
          </div>

          <form
            onSubmit={handleAliasSubmit}
            className="flex flex-col gap-2 border-t border-neutral-100 pt-3"
          >
            <label className="text-sm font-medium text-neutral-700">
              Alias / CBU bancario
            </label>
            <div className="flex flex-wrap gap-2">
              <input
                value={bankAlias}
                onChange={(e) => setBankAlias(e.target.value)}
                placeholder="mi.alias.mp"
                className="min-w-[14rem] flex-1 rounded-lg border border-neutral-300 px-4 py-2 focus:border-brand-500 focus:outline-none"
              />
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-brand-600 px-4 py-2 font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
              >
                {saving ? "Guardando..." : "Guardar alias"}
              </button>
            </div>
            <span className="text-xs text-neutral-400">
              Es lo que ve el cliente para transferir a mano cuando paga con
              este medio.
            </span>
          </form>
        </div>
      </div>
    </div>
  );
}
