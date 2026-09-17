"use client";

import { useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api-client";
import {
  formatCurrency,
  COUPON_DISCOUNT_TYPE_LABELS,
  COUPON_STATUS_LABELS,
  type CouponDTO,
  type CouponDiscountType,
  type CouponStatus,
} from "@/types";

const EMPTY = {
  code: "",
  discountType: "PERCENT" as CouponDiscountType,
  discountValue: "",
  budgetCap: "",
  expiresAt: "",
  active: true,
};

type FormState = typeof EMPTY;

export default function CuponesClient() {
  const [coupons, setCoupons] = useState<CouponDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);

  function load() {
    apiFetch<CouponDTO[]>("/api/admin/coupons")
      .then(setCoupons)
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

  function startEdit(c: CouponDTO) {
    setEditingId(c.id);
    setForm({
      code: c.code,
      discountType: c.discountType,
      discountValue: String(c.discountValue),
      budgetCap: c.budgetCap != null ? String(c.budgetCap) : "",
      expiresAt: c.expiresAt ? c.expiresAt.slice(0, 10) : "",
      active: c.active,
    });
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const payload = {
      code: form.code.trim(),
      discountType: form.discountType,
      discountValue: Number(form.discountValue),
      budgetCap: form.budgetCap.trim() ? Number(form.budgetCap) : null,
      expiresAt: form.expiresAt || null,
      active: form.active,
    };
    try {
      if (editingId) {
        await apiFetch(`/api/admin/coupons/${editingId}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch("/api/admin/coupons", {
          method: "POST",
          body: JSON.stringify({
            ...payload,
            budgetCap: payload.budgetCap ?? undefined,
            expiresAt: payload.expiresAt ?? undefined,
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

  async function handleDelete(c: CouponDTO) {
    if (!confirm(`¿Eliminar el cupón "${c.code}"?`)) return;
    setError(null);
    try {
      await apiFetch(`/api/admin/coupons/${c.id}`, { method: "DELETE" });
      if (editingId === c.id) startCreate();
      load();
    } catch (err) {
      setError((err as ApiError).message);
    }
  }

  async function toggleActive(c: CouponDTO) {
    setError(null);
    try {
      await apiFetch(`/api/admin/coupons/${c.id}`, {
        method: "PATCH",
        body: JSON.stringify({ active: !c.active }),
      });
      load();
    } catch (err) {
      setError((err as ApiError).message);
    }
  }

  return (
    <div>
      <h2 className="mb-1 text-2xl font-bold text-navy-900">Cupones</h2>
      <p className="mb-6 max-w-xl text-sm text-neutral-600">
        Códigos de descuento que el cliente carga en el checkout. Cada cupón
        lo puede usar una sola vez por cliente (por teléfono).
      </p>

      <form
        onSubmit={handleSubmit}
        className="mb-8 flex flex-col gap-4 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm"
      >
        <h3 className="font-semibold text-neutral-900">
          {editingId ? "Editar cupón" : "Nuevo cupón"}
        </h3>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Código *">
            <input
              value={form.code}
              onChange={(e) => set("code", e.target.value.toUpperCase())}
              placeholder="Ej: ROWLYSXARG"
              className={inputCls + " font-mono uppercase"}
            />
          </Field>
          <Field label="Tipo de descuento">
            <select
              value={form.discountType}
              onChange={(e) => set("discountType", e.target.value as CouponDiscountType)}
              className={inputCls}
            >
              {(Object.keys(COUPON_DISCOUNT_TYPE_LABELS) as CouponDiscountType[]).map(
                (type) => (
                  <option key={type} value={type}>
                    {COUPON_DISCOUNT_TYPE_LABELS[type]}
                  </option>
                )
              )}
            </select>
          </Field>
          <Field
            label={form.discountType === "PERCENT" ? "Valor (%) *" : "Valor ($) *"}
          >
            <input
              type="number"
              min={0}
              max={form.discountType === "PERCENT" ? 100 : undefined}
              step="1"
              value={form.discountValue}
              onChange={(e) => set("discountValue", e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="Presupuesto máximo ($)">
            <input
              type="number"
              min={0}
              step="1"
              value={form.budgetCap}
              onChange={(e) => set("budgetCap", e.target.value)}
              placeholder="Sin límite"
              className={inputCls}
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Vence el">
            <input
              type="date"
              value={form.expiresAt}
              onChange={(e) => set("expiresAt", e.target.value)}
              className={inputCls}
            />
          </Field>
        </div>

        <label className="flex w-fit items-center gap-2 text-sm text-neutral-700">
          <input
            type="checkbox"
            checked={form.active}
            onChange={(e) => set("active", e.target.checked)}
          />
          Activo (el cliente lo puede usar)
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={saving || !form.code.trim() || !form.discountValue.trim()}
            className="rounded-lg bg-brand-600 px-4 py-2 font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
          >
            {editingId ? "Guardar cambios" : "Crear cupón"}
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

      {coupons === null ? (
        <p className="text-neutral-500">Cargando...</p>
      ) : coupons.length === 0 ? (
        <p className="text-neutral-500">Todavía no hay cupones.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white shadow-sm">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-xs uppercase tracking-wide text-neutral-400">
                <th className="px-4 py-3 font-medium">Código</th>
                <th className="px-4 py-3 font-medium">Descuento</th>
                <th className="px-4 py-3 font-medium">Usos</th>
                <th className="px-4 py-3 font-medium">Presupuesto</th>
                <th className="px-4 py-3 font-medium">Vence</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {coupons.map((c) => (
                <tr key={c.id} className={c.active ? "" : "bg-neutral-50"}>
                  <td className="px-4 py-3 font-mono font-medium text-neutral-900">
                    {c.code}
                  </td>
                  <td className="px-4 py-3 text-neutral-600">
                    {c.discountType === "PERCENT"
                      ? `${c.discountValue}%`
                      : formatCurrency(c.discountValue)}
                  </td>
                  <td className="px-4 py-3 text-neutral-600">{c.redemptionsCount}</td>
                  <td className="px-4 py-3 text-neutral-600">
                    {c.budgetCap != null
                      ? `${formatCurrency(c.totalDiscounted)} / ${formatCurrency(c.budgetCap)}`
                      : "Sin límite"}
                  </td>
                  <td className="px-4 py-3 text-neutral-600">
                    {c.expiresAt
                      ? new Date(c.expiresAt).toLocaleDateString("es-AR", {
                          timeZone: "America/Argentina/Buenos_Aires",
                        })
                      : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={c.status} />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => startEdit(c)}
                        className="text-sm font-medium text-brand-600 hover:underline"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => toggleActive(c)}
                        className="text-sm font-medium text-neutral-500 hover:underline"
                      >
                        {c.active ? "Desactivar" : "Activar"}
                      </button>
                      <button
                        onClick={() => handleDelete(c)}
                        className="text-sm font-medium text-red-600 hover:underline"
                      >
                        Eliminar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const STATUS_STYLES: Record<CouponStatus, string> = {
  ACTIVE: "bg-green-100 text-green-700",
  INACTIVE: "bg-neutral-200 text-neutral-600",
  EXPIRED: "bg-red-100 text-red-700",
  EXHAUSTED: "bg-amber-100 text-amber-700",
};

function StatusBadge({ status }: { status: CouponStatus }) {
  return (
    <span
      className={
        "rounded-full px-2.5 py-1 text-xs font-semibold " + STATUS_STYLES[status]
      }
    >
      {COUPON_STATUS_LABELS[status]}
    </span>
  );
}

const inputCls =
  "rounded-lg border border-neutral-300 px-4 py-2 focus:border-brand-500 focus:outline-none";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-neutral-700">{label}</label>
      {children}
    </div>
  );
}
