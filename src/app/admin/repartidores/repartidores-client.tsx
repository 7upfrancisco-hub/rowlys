"use client";

import { useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api-client";
import { normalizeArPhone } from "@/lib/phone";
import type { DriverDTO } from "@/types";

const EMPTY = {
  name: "",
  phone: "",
  vehicle: "",
  licensePlate: "",
  documentId: "",
  address: "",
  notes: "",
  active: true,
};

type FormState = typeof EMPTY;

export default function RepartidoresClient() {
  const [drivers, setDrivers] = useState<DriverDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);

  function load() {
    apiFetch<DriverDTO[]>("/api/admin/drivers")
      .then(setDrivers)
      .catch((err: ApiError) => setError(err.message));
  }
  useEffect(load, []);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function startCreate() {
    setEditingId(null);
    setForm(EMPTY);
    setError(null);
  }

  function startEdit(d: DriverDTO) {
    setEditingId(d.id);
    setForm({
      name: d.name,
      phone: d.phone,
      vehicle: d.vehicle ?? "",
      licensePlate: d.licensePlate ?? "",
      documentId: d.documentId ?? "",
      address: d.address ?? "",
      notes: d.notes ?? "",
      active: d.active,
    });
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    // El backend recorta strings vacíos vía zod .optional() sólo si no vienen;
    // acá mandamos null explícito para poder limpiar un campo en un PATCH.
    const payload = {
      name: form.name.trim(),
      phone: form.phone.trim(),
      vehicle: form.vehicle.trim() || null,
      licensePlate: form.licensePlate.trim() || null,
      documentId: form.documentId.trim() || null,
      address: form.address.trim() || null,
      notes: form.notes.trim() || null,
      active: form.active,
    };
    try {
      if (editingId) {
        await apiFetch(`/api/admin/drivers/${editingId}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch("/api/admin/drivers", {
          method: "POST",
          body: JSON.stringify({
            ...payload,
            vehicle: payload.vehicle ?? undefined,
            licensePlate: payload.licensePlate ?? undefined,
            documentId: payload.documentId ?? undefined,
            address: payload.address ?? undefined,
            notes: payload.notes ?? undefined,
          }),
        });
      }
      startCreate();
      load();
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(d: DriverDTO) {
    if (!confirm(`¿Eliminar a ${d.name}? Los pedidos que tenga asignados quedan sin repartidor.`))
      return;
    setError(null);
    try {
      await apiFetch(`/api/admin/drivers/${d.id}`, { method: "DELETE" });
      if (editingId === d.id) startCreate();
      load();
    } catch (err) {
      setError((err as ApiError).message);
    }
  }

  async function toggleActive(d: DriverDTO) {
    setError(null);
    try {
      await apiFetch(`/api/admin/drivers/${d.id}`, {
        method: "PATCH",
        body: JSON.stringify({ active: !d.active }),
      });
      load();
    } catch (err) {
      setError((err as ApiError).message);
    }
  }

  const phoneOk = form.phone.trim() === "" || normalizeArPhone(form.phone) !== null;

  return (
    <div>
      <h2 className="mb-6 text-2xl font-bold text-navy-900">Repartidores</h2>

      <form
        onSubmit={handleSubmit}
        className="mb-8 flex flex-col gap-4 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm"
      >
        <h3 className="font-semibold text-neutral-900">
          {editingId ? "Editar repartidor" : "Nuevo repartidor"}
        </h3>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Nombre y apellido *">
            <input
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field
            label="Teléfono / WhatsApp *"
            hint={
              !phoneOk
                ? "No parece un celular argentino válido para WhatsApp."
                : undefined
            }
          >
            <input
              value={form.phone}
              onChange={(e) => set("phone", e.target.value)}
              placeholder="Ej: 3462 55-1234"
              className={inputCls + (phoneOk ? "" : " border-red-400")}
            />
          </Field>
          <Field label="Vehículo">
            <input
              value={form.vehicle}
              onChange={(e) => set("vehicle", e.target.value)}
              placeholder="Ej: Moto Honda Wave 110, negra"
              className={inputCls}
            />
          </Field>
          <Field label="Patente">
            <input
              value={form.licensePlate}
              onChange={(e) => set("licensePlate", e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="DNI">
            <input
              value={form.documentId}
              onChange={(e) => set("documentId", e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="Dirección">
            <input
              value={form.address}
              onChange={(e) => set("address", e.target.value)}
              className={inputCls}
            />
          </Field>
        </div>

        <Field label="Notas">
          <textarea
            value={form.notes}
            onChange={(e) => set("notes", e.target.value)}
            rows={2}
            placeholder="Días/horarios que trabaja, zona que cubre, contacto de emergencia..."
            className={inputCls}
          />
        </Field>

        <label className="flex w-fit items-center gap-2 text-sm text-neutral-700">
          <input
            type="checkbox"
            checked={form.active}
            onChange={(e) => set("active", e.target.checked)}
          />
          Activo (aparece para asignar en la comanda)
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={saving || !form.name.trim() || !form.phone.trim()}
            className="rounded-lg bg-brand-600 px-4 py-2 font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
          >
            {editingId ? "Guardar cambios" : "Agregar repartidor"}
          </button>
          {editingId && (
            <button
              type="button"
              onClick={startCreate}
              className="text-sm font-medium text-neutral-500 hover:underline"
            >
              Cancelar edición
            </button>
          )}
        </div>
      </form>

      {drivers === null ? (
        <p className="text-neutral-500">Cargando...</p>
      ) : drivers.length === 0 ? (
        <p className="text-neutral-500">Todavía no hay repartidores.</p>
      ) : (
        <ul className="divide-y divide-neutral-200 rounded-2xl border border-neutral-200 bg-white shadow-sm">
          {drivers.map((d) => (
            <li
              key={d.id}
              className={
                "flex items-start justify-between gap-4 px-6 py-4 " +
                (d.active ? "" : "bg-neutral-50")
              }
            >
              <div className="min-w-0">
                <p className="flex items-center gap-2 font-medium text-neutral-900">
                  <span className={d.active ? "" : "text-neutral-400"}>
                    {d.name}
                  </span>
                  {!d.active && (
                    <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-xs font-medium text-neutral-600">
                      Inactivo
                    </span>
                  )}
                </p>
                <p className="text-sm text-neutral-500">
                  {d.phone}
                  {d.vehicle ? ` · ${d.vehicle}` : ""}
                  {d.licensePlate ? ` · ${d.licensePlate}` : ""}
                </p>
                {(d.documentId || d.address) && (
                  <p className="text-sm text-neutral-400">
                    {[d.documentId && `DNI ${d.documentId}`, d.address]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                )}
                {d.notes && (
                  <p className="mt-1 text-sm italic text-neutral-500">{d.notes}</p>
                )}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2">
                <div className="flex gap-3">
                  <button
                    onClick={() => startEdit(d)}
                    className="text-sm font-medium text-brand-600 hover:underline"
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => handleDelete(d)}
                    className="text-sm font-medium text-red-600 hover:underline"
                  >
                    Eliminar
                  </button>
                </div>
                <button
                  onClick={() => toggleActive(d)}
                  className="text-xs font-medium text-neutral-500 hover:underline"
                >
                  {d.active ? "Marcar inactivo" : "Reactivar"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const inputCls =
  "rounded-lg border border-neutral-300 px-4 py-2 focus:border-brand-500 focus:outline-none";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-neutral-700">{label}</label>
      {children}
      {hint && <span className="text-xs text-red-600">{hint}</span>}
    </div>
  );
}
