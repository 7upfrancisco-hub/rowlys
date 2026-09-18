"use client";

import { useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api-client";
import { formatCurrency } from "@/types";
import type { LatLng } from "@/lib/geo";
import DeliveryZoneMap from "@/components/DeliveryZoneMap";

interface DeliveryZone {
  id: string;
  name: string;
  fee: number;
  enabled: boolean;
  order: number;
  polygon: LatLng[] | null;
}

export default function ZonasEnvioClient() {
  const [zones, setZones] = useState<DeliveryZone[] | null>(null);
  const [storeAddress, setStoreAddress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<DeliveryZone | null>(null);

  function load() {
    apiFetch<DeliveryZone[]>("/api/admin/delivery-zones")
      .then(setZones)
      .catch((err: ApiError) => setError(err.message));
    apiFetch<{ storeAddress: string | null }>("/api/admin/settings")
      .then((s) => setStoreAddress(s.storeAddress))
      .catch(() => {});
  }

  useEffect(load, []);

  function startCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function startEdit(zone: DeliveryZone) {
    setEditing(zone);
    setFormOpen(true);
  }

  function handleSaved() {
    setFormOpen(false);
    setEditing(null);
    load();
  }

  async function toggleEnabled(zone: DeliveryZone) {
    setError(null);
    try {
      await apiFetch(`/api/admin/delivery-zones/${zone.id}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled: !zone.enabled }),
      });
      load();
    } catch (err) {
      setError((err as ApiError).message);
    }
  }

  async function moveZone(zone: DeliveryZone, direction: -1 | 1) {
    const list = zones ?? [];
    const idx = list.findIndex((z) => z.id === zone.id);
    const swapWith = list[idx + direction];
    if (!swapWith) return;
    setError(null);
    try {
      await Promise.all([
        apiFetch(`/api/admin/delivery-zones/${zone.id}`, {
          method: "PATCH",
          body: JSON.stringify({ order: swapWith.order }),
        }),
        apiFetch(`/api/admin/delivery-zones/${swapWith.id}`, {
          method: "PATCH",
          body: JSON.stringify({ order: zone.order }),
        }),
      ]);
      load();
    } catch (err) {
      setError((err as ApiError).message);
    }
  }

  async function handleDelete(zone: DeliveryZone) {
    if (!confirm(`¿Eliminar la zona "${zone.name}"?`)) return;
    setError(null);
    try {
      await apiFetch(`/api/admin/delivery-zones/${zone.id}`, { method: "DELETE" });
      load();
    } catch (err) {
      setError((err as ApiError).message);
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-2xl font-bold text-navy-900">Zonas de envío</h2>
        {!formOpen && (
          <button
            onClick={startCreate}
            className="rounded-lg bg-brand-600 px-4 py-2 font-semibold text-white transition hover:bg-brand-700"
          >
            Nueva zona
          </button>
        )}
      </div>

      <p className="mb-4 text-sm text-neutral-500">
        Cada zona tiene su propia tarifa de envío. Una zona sin área marcada en
        el mapa cubre cualquier dirección (útil si envías a toda la ciudad);
        una zona con área solo se aplica si la dirección del cliente cae
        adentro — y si no entra en ninguna zona con área, no puede pedir
        envío. Si no cargás ninguna zona, se sigue usando la tarifa fija de
        Configuración.
      </p>

      {formOpen && (
        <ZoneForm
          initial={editing}
          storeAddress={storeAddress}
          onSaved={handleSaved}
          onCancel={() => setFormOpen(false)}
        />
      )}

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {zones === null ? (
        <p className="text-neutral-500">Cargando...</p>
      ) : zones.length === 0 ? (
        <p className="text-neutral-500">
          Todavía no hay zonas cargadas — se usa la tarifa fija de
          Configuración.
        </p>
      ) : (
        <ul className="divide-y divide-neutral-200 rounded-2xl border border-neutral-200 bg-white shadow-sm">
          {zones.map((zone, idx) => (
            <li
              key={zone.id}
              className={
                "flex items-center justify-between gap-4 px-6 py-4 " +
                (zone.enabled ? "" : "bg-neutral-50")
              }
            >
              <div className="flex items-center gap-4">
                <div className="flex flex-col gap-0.5">
                  <button
                    type="button"
                    onClick={() => moveZone(zone, -1)}
                    disabled={idx === 0}
                    aria-label="Subir"
                    className="rounded border border-neutral-300 px-1.5 text-neutral-500 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    onClick={() => moveZone(zone, 1)}
                    disabled={idx === zones.length - 1}
                    aria-label="Bajar"
                    className="rounded border border-neutral-300 px-1.5 text-neutral-500 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    ▼
                  </button>
                </div>
                <div>
                  <p className="flex items-center gap-2 font-medium text-neutral-900">
                    <span className={zone.enabled ? "" : "text-neutral-400"}>
                      {zone.name}
                    </span>
                    {!zone.enabled && (
                      <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-xs font-medium text-neutral-600">
                        Desactivada
                      </span>
                    )}
                    {!zone.polygon && (
                      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                        Sin restricción
                      </span>
                    )}
                  </p>
                  <p className="text-sm text-neutral-500">
                    {formatCurrency(zone.fee)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => toggleEnabled(zone)}
                  className={
                    "rounded-lg border px-2.5 py-1 text-sm font-medium " +
                    (zone.enabled
                      ? "border-neutral-300 text-neutral-600 hover:bg-neutral-100"
                      : "border-green-500 text-green-700 hover:bg-green-50")
                  }
                >
                  {zone.enabled ? "Desactivar" : "Activar"}
                </button>
                <button
                  onClick={() => startEdit(zone)}
                  className="text-sm font-medium text-brand-600 hover:underline"
                >
                  Editar
                </button>
                <button
                  onClick={() => handleDelete(zone)}
                  className="text-sm font-medium text-red-600 hover:underline"
                >
                  Eliminar
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ZoneForm({
  initial,
  storeAddress,
  onSaved,
  onCancel,
}: {
  initial: DeliveryZone | null;
  storeAddress: string | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [fee, setFee] = useState<string>(
    initial?.fee != null ? String(initial.fee) : ""
  );
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);
  const [restricted, setRestricted] = useState(!!initial?.polygon);
  const [polygon, setPolygon] = useState<LatLng[] | null>(initial?.polygon ?? null);
  const [mapCenter, setMapCenter] = useState<LatLng | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Geocodifica la dirección del local una sola vez, recién cuando el admin
  // activa el mapa — así no gasta una consulta de más si nunca lo usa.
  useEffect(() => {
    if (!restricted || mapCenter || !storeAddress) return;
    let cancelled = false;
    apiFetch<{ lat: number; lng: number }[]>(
      `/api/geocode?q=${encodeURIComponent(storeAddress)}`
    )
      .then((results) => {
        if (cancelled || !results[0]) return;
        setMapCenter({ lat: results[0].lat, lng: results[0].lng });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [restricted, mapCenter, storeAddress]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const numericFee = Number(fee);
    if (!fee.trim() || !Number.isFinite(numericFee) || numericFee < 0) {
      setError("Ingresá una tarifa válida.");
      return;
    }
    if (restricted && (!polygon || polygon.length < 3)) {
      setError("Marcá al menos 3 puntos en el mapa para delimitar la zona.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const body = {
        name,
        fee: numericFee,
        enabled,
        polygon: restricted ? polygon : null,
      };
      if (initial) {
        await apiFetch(`/api/admin/delivery-zones/${initial.id}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
      } else {
        await apiFetch("/api/admin/delivery-zones", {
          method: "POST",
          body: JSON.stringify(body),
        });
      }
      onSaved();
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mb-8 flex flex-col gap-4 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm"
    >
      <h3 className="font-semibold text-neutral-900">
        {initial ? "Editar zona" : "Nueva zona"}
      </h3>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-neutral-700">Nombre</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder='Ej: "Centro" o "Toda la ciudad"'
            className="rounded-lg border border-neutral-300 px-4 py-2 focus:border-brand-500 focus:outline-none"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-neutral-700">
            Tarifa de envío
          </label>
          <input
            type="number"
            step="1"
            value={fee}
            onChange={(e) => setFee(e.target.value)}
            onFocus={(e) => e.target.select()}
            placeholder="0"
            className="rounded-lg border border-neutral-300 px-4 py-2 focus:border-brand-500 focus:outline-none"
          />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-neutral-700">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
        />
        Zona activa
      </label>

      <div className="flex flex-col gap-2 rounded-lg border border-neutral-200 p-4">
        <label className="flex items-start gap-2 text-sm text-neutral-700">
          <input
            type="radio"
            name="restrict"
            checked={!restricted}
            onChange={() => setRestricted(false)}
            className="mt-0.5"
          />
          <span>
            Sin restricción
            <span className="block text-xs text-neutral-400">
              Cubre cualquier dirección — usala para "toda la ciudad".
            </span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm text-neutral-700">
          <input
            type="radio"
            name="restrict"
            checked={restricted}
            onChange={() => setRestricted(true)}
            className="mt-0.5"
          />
          <span>
            Restringida a un área del mapa
            <span className="block text-xs text-neutral-400">
              Solo entran los pedidos cuya dirección real cae dentro del área
              que marques.
            </span>
          </span>
        </label>

        {restricted && (
          <div className="mt-2">
            <DeliveryZoneMap value={polygon} onChange={setPolygon} center={mapCenter} />
          </div>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={saving || !name.trim()}
          className="rounded-lg bg-brand-600 px-4 py-2 font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
        >
          {saving ? "Guardando..." : initial ? "Guardar cambios" : "Agregar zona"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-sm font-medium text-neutral-500 hover:underline"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
