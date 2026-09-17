"use client";

import { useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api-client";
import {
  formatCurrency,
  DISCOUNT_KIND_LABELS,
  PAYMENT_PROVIDER_LABELS,
  type DiscountDTO,
  type DiscountKind,
  type DiscountValueType,
  type DiscountTarget,
  type PaymentProvider,
} from "@/types";

interface Option {
  id: string;
  name: string;
}

const DISCOUNT_KINDS: DiscountKind[] = ["DIRECT", "COMBO", "PAYMENT_METHOD", "FREE_SHIPPING"];
const PAYMENT_PROVIDERS: PaymentProvider[] = ["CASH", "MP", "MODO", "BANK_TRANSFER"];

const EMPTY = {
  kind: "DIRECT" as DiscountKind,
  title: "",
  active: true,
  target: "PRODUCT" as DiscountTarget,
  productId: "",
  categoryId: "",
  valueType: "PERCENT" as DiscountValueType,
  value: "",
  triggerProductId: "",
  rewardProductId: "",
  paymentProvider: "CASH" as PaymentProvider,
};

type FormState = typeof EMPTY;

export default function DescuentosClient() {
  const [discounts, setDiscounts] = useState<DiscountDTO[] | null>(null);
  const [products, setProducts] = useState<Option[]>([]);
  const [categories, setCategories] = useState<Option[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);

  function load() {
    Promise.all([
      apiFetch<DiscountDTO[]>("/api/admin/discounts"),
      apiFetch<Option[]>("/api/admin/products"),
      apiFetch<Option[]>("/api/admin/categories"),
    ])
      .then(([d, p, c]) => {
        setDiscounts(d);
        setProducts(p);
        setCategories(c);
      })
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
    setFormOpen(true);
  }

  function startEdit(d: DiscountDTO) {
    setEditingId(d.id);
    setForm({
      kind: d.kind,
      title: d.title,
      active: d.active,
      target: d.target ?? "PRODUCT",
      productId: d.productId ?? "",
      categoryId: d.categoryId ?? "",
      valueType: d.valueType ?? "PERCENT",
      value: d.value != null ? String(d.value) : "",
      triggerProductId: d.triggerProductId ?? "",
      rewardProductId: d.rewardProductId ?? "",
      paymentProvider: d.paymentProvider ?? "CASH",
    });
    setError(null);
    setFormOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const base = { kind: form.kind, title: form.title.trim(), active: form.active };
    let payload: Record<string, unknown> = base;
    if (form.kind === "DIRECT") {
      payload = {
        ...base,
        target: form.target,
        productId: form.target === "PRODUCT" ? form.productId : undefined,
        categoryId: form.target === "CATEGORY" ? form.categoryId : undefined,
        valueType: form.valueType,
        value: Number(form.value),
      };
    } else if (form.kind === "COMBO") {
      payload = {
        ...base,
        triggerProductId: form.triggerProductId,
        rewardProductId: form.rewardProductId,
        valueType: form.valueType,
        value: Number(form.value),
      };
    } else if (form.kind === "PAYMENT_METHOD") {
      payload = {
        ...base,
        paymentProvider: form.paymentProvider,
        valueType: form.valueType,
        value: Number(form.value),
      };
    }
    try {
      if (editingId) {
        await apiFetch(`/api/admin/discounts/${editingId}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch("/api/admin/discounts", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }
      setFormOpen(false);
      load();
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(d: DiscountDTO) {
    if (!confirm(`¿Eliminar el descuento "${d.title}"?`)) return;
    setError(null);
    try {
      await apiFetch(`/api/admin/discounts/${d.id}`, { method: "DELETE" });
      load();
    } catch (err) {
      setError((err as ApiError).message);
    }
  }

  async function toggleActive(d: DiscountDTO) {
    setError(null);
    try {
      await apiFetch(`/api/admin/discounts/${d.id}`, {
        method: "PATCH",
        body: JSON.stringify(toEditPayload(d, !d.active)),
      });
      load();
    } catch (err) {
      setError((err as ApiError).message);
    }
  }

  const canSubmit =
    form.title.trim().length > 0 &&
    (form.kind === "FREE_SHIPPING" || form.value.trim().length > 0) &&
    (form.kind !== "DIRECT" ||
      (form.target === "PRODUCT" ? !!form.productId : !!form.categoryId)) &&
    (form.kind !== "COMBO" || (!!form.triggerProductId && !!form.rewardProductId));

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-2xl font-bold text-navy-900">Descuentos</h2>
        {!formOpen && (
          <button
            onClick={startCreate}
            className="rounded-lg bg-brand-600 px-4 py-2 font-semibold text-white transition hover:bg-brand-700"
          >
            Nuevo descuento
          </button>
        )}
      </div>
      <p className="mb-6 max-w-xl text-sm text-neutral-600">
        Reglas automáticas: se aplican solas, sin que el cliente cargue nada
        (a diferencia de los cupones).
      </p>

      {formOpen && (
        <form
          onSubmit={handleSubmit}
          className="mb-8 flex flex-col gap-4 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm"
        >
          <h3 className="font-semibold text-neutral-900">
            {editingId ? "Editar descuento" : "Nuevo descuento"}
          </h3>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-neutral-700">
              Tipo de descuento
            </label>
            <div className="flex flex-wrap gap-2">
              {DISCOUNT_KINDS.map((kind) => (
                <button
                  key={kind}
                  type="button"
                  onClick={() => set("kind", kind)}
                  className={
                    "rounded-full border px-4 py-1.5 text-sm font-medium transition " +
                    (form.kind === kind
                      ? "border-brand-600 bg-brand-600 text-white"
                      : "border-neutral-300 text-neutral-600 hover:bg-neutral-50")
                  }
                >
                  {DISCOUNT_KIND_LABELS[kind]}
                </button>
              ))}
            </div>
          </div>

          <Field label="Título a mostrar *" hint="Ej: 10% de descuento en efectivo">
            <input
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              className={inputCls}
            />
          </Field>

          {form.kind === "DIRECT" && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Aplica a">
                <select
                  value={form.target}
                  onChange={(e) => set("target", e.target.value as DiscountTarget)}
                  className={inputCls}
                >
                  <option value="PRODUCT">Un producto</option>
                  <option value="CATEGORY">Una categoría</option>
                </select>
              </Field>
              {form.target === "PRODUCT" ? (
                <Field label="Producto">
                  <select
                    value={form.productId}
                    onChange={(e) => set("productId", e.target.value)}
                    className={inputCls}
                  >
                    <option value="">Elegí un producto...</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </Field>
              ) : (
                <Field label="Categoría">
                  <select
                    value={form.categoryId}
                    onChange={(e) => set("categoryId", e.target.value)}
                    className={inputCls}
                  >
                    <option value="">Elegí una categoría...</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
            </div>
          )}

          {form.kind === "COMBO" && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Comprás este producto" hint="El que dispara el combo">
                <select
                  value={form.triggerProductId}
                  onChange={(e) => set("triggerProductId", e.target.value)}
                  className={inputCls}
                >
                  <option value="">Elegí un producto...</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                label="Se descuenta este producto"
                hint="Si elegís el mismo de arriba, es un 2x1"
              >
                <select
                  value={form.rewardProductId}
                  onChange={(e) => set("rewardProductId", e.target.value)}
                  className={inputCls}
                >
                  <option value="">Elegí un producto...</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          )}

          {form.kind === "PAYMENT_METHOD" && (
            <Field label="Medio de pago">
              <select
                value={form.paymentProvider}
                onChange={(e) => set("paymentProvider", e.target.value as PaymentProvider)}
                className={inputCls}
              >
                {PAYMENT_PROVIDERS.map((p) => (
                  <option key={p} value={p}>
                    {PAYMENT_PROVIDER_LABELS[p]}
                  </option>
                ))}
              </select>
            </Field>
          )}

          {form.kind !== "FREE_SHIPPING" && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Tipo de valor">
                <select
                  value={form.valueType}
                  onChange={(e) => set("valueType", e.target.value as DiscountValueType)}
                  className={inputCls}
                >
                  <option value="PERCENT">Porcentaje</option>
                  <option value="FIXED">Monto fijo</option>
                </select>
              </Field>
              <Field label={form.valueType === "PERCENT" ? "Valor (%)" : "Valor ($)"}>
                <input
                  type="number"
                  min={0}
                  max={form.valueType === "PERCENT" ? 100 : undefined}
                  step="1"
                  value={form.value}
                  onChange={(e) => set("value", e.target.value)}
                  className={inputCls}
                />
              </Field>
            </div>
          )}

          <label className="flex w-fit items-center gap-2 text-sm text-neutral-700">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => set("active", e.target.checked)}
            />
            Activo
          </label>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={saving || !canSubmit}
              className="rounded-lg bg-brand-600 px-4 py-2 font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
            >
              {editingId ? "Guardar cambios" : "Crear descuento"}
            </button>
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              className="text-sm font-medium text-neutral-500 hover:underline"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {!formOpen && error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {discounts === null ? (
        <p className="text-neutral-500">Cargando...</p>
      ) : discounts.length === 0 ? (
        <p className="text-neutral-500">Todavía no hay descuentos.</p>
      ) : (
        <ul className="divide-y divide-neutral-200 rounded-2xl border border-neutral-200 bg-white shadow-sm">
          {discounts.map((d) => (
            <li
              key={d.id}
              className={
                "flex items-start justify-between gap-4 px-6 py-4 " +
                (d.active ? "" : "bg-neutral-50")
              }
            >
              <div className="min-w-0">
                <p className="flex items-center gap-2 font-medium text-neutral-900">
                  <span className={d.active ? "" : "text-neutral-400"}>{d.title}</span>
                  {!d.active && (
                    <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-xs font-medium text-neutral-600">
                      Inactivo
                    </span>
                  )}
                </p>
                <p className="text-sm text-neutral-500">
                  {DISCOUNT_KIND_LABELS[d.kind]} · {describeTarget(d)}
                  {d.valueType && ` · ${describeValue(d)}`}
                </p>
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
                  {d.active ? "Desactivar" : "Activar"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function describeTarget(d: DiscountDTO): string {
  switch (d.kind) {
    case "DIRECT":
      return d.target === "PRODUCT" ? (d.product?.name ?? "—") : `Categoría: ${d.category?.name ?? "—"}`;
    case "COMBO":
      return `${d.triggerProduct?.name ?? "—"} → ${d.rewardProduct?.name ?? "—"}`;
    case "PAYMENT_METHOD":
      return d.paymentProvider ? PAYMENT_PROVIDER_LABELS[d.paymentProvider] : "—";
    case "FREE_SHIPPING":
      return "Envío";
  }
}

function describeValue(d: DiscountDTO): string {
  if (d.valueType == null || d.value == null) return "";
  return d.valueType === "PERCENT" ? `${d.value}%` : formatCurrency(d.value);
}

// Payload de PATCH para un simple toggle de activo/inactivo, reconstruyendo
// los campos propios del tipo (la API espera el objeto completo, no un
// parcial — ver nota en el route handler).
function toEditPayload(d: DiscountDTO, active: boolean): Record<string, unknown> {
  const base = { kind: d.kind, title: d.title, active };
  if (d.kind === "DIRECT") {
    return {
      ...base,
      target: d.target,
      productId: d.target === "PRODUCT" ? d.productId ?? undefined : undefined,
      categoryId: d.target === "CATEGORY" ? d.categoryId ?? undefined : undefined,
      valueType: d.valueType,
      value: d.value,
    };
  }
  if (d.kind === "COMBO") {
    return {
      ...base,
      triggerProductId: d.triggerProductId,
      rewardProductId: d.rewardProductId,
      valueType: d.valueType,
      value: d.value,
    };
  }
  if (d.kind === "PAYMENT_METHOD") {
    return {
      ...base,
      paymentProvider: d.paymentProvider,
      valueType: d.valueType,
      value: d.value,
    };
  }
  return base;
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
      {hint && <span className="text-xs text-neutral-400">{hint}</span>}
    </div>
  );
}
