"use client";

import { useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api-client";
import { formatCurrency } from "@/types";
import type { ModifierGroupDTO } from "@/types";
import ProductForm, {
  type AdminCategory,
  type AdminProduct,
} from "./product-form";

export default function ProductosClient() {
  const [products, setProducts] = useState<AdminProduct[] | null>(null);
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [modifierGroups, setModifierGroups] = useState<ModifierGroupDTO[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AdminProduct | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  function load() {
    Promise.all([
      apiFetch<AdminProduct[]>("/api/admin/products"),
      apiFetch<AdminCategory[]>("/api/admin/categories"),
      apiFetch<ModifierGroupDTO[]>("/api/admin/modifier-groups"),
    ])
      .then(([p, c, g]) => {
        setProducts(p);
        setCategories(c);
        setModifierGroups(g.filter((group) => group.active));
      })
      .catch((err: ApiError) => setError(err.message));
  }

  useEffect(load, []);

  function startCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function startEdit(product: AdminProduct) {
    setEditing(product);
    setFormOpen(true);
  }

  function handleSaved() {
    setFormOpen(false);
    setEditing(null);
    load();
  }

  // Sube o baja un producto un lugar dentro de su categoría intercambiando
  // su `order` con el del vecino (mismo patrón de huecos que Category.order).
  async function moveProduct(product: AdminProduct, direction: -1 | 1) {
    const siblings = (grouped.get(product.categoryId) ?? []);
    const idx = siblings.findIndex((p) => p.id === product.id);
    const swapWith = siblings[idx + direction];
    if (!swapWith) return;
    setError(null);
    try {
      await Promise.all([
        apiFetch(`/api/admin/products/${product.id}`, {
          method: "PATCH",
          body: JSON.stringify({ order: swapWith.order }),
        }),
        apiFetch(`/api/admin/products/${swapWith.id}`, {
          method: "PATCH",
          body: JSON.stringify({ order: product.order }),
        }),
      ]);
      load();
    } catch (err) {
      setError((err as ApiError).message);
    }
  }

  async function handleDelete(product: AdminProduct) {
    if (!confirm(`¿Eliminar "${product.name}"?`)) return;
    setError(null);
    try {
      await apiFetch(`/api/admin/products/${product.id}`, {
        method: "DELETE",
      });
      load();
    } catch (err) {
      setError((err as ApiError).message);
    }
  }

  // Ocultar / mostrar un producto en la carta sin abrir el formulario
  // (p. ej. cuando se queda sin stock).
  async function toggleStock(product: AdminProduct) {
    setError(null);
    setTogglingId(product.id);
    try {
      await apiFetch(`/api/admin/products/${product.id}`, {
        method: "PATCH",
        body: JSON.stringify({ available: !product.available }),
      });
      load();
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setTogglingId(null);
    }
  }

  const grouped = new Map<string, AdminProduct[]>();
  for (const product of products ?? []) {
    const list = grouped.get(product.categoryId) ?? [];
    list.push(product);
    grouped.set(product.categoryId, list);
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-2xl font-bold text-navy-900">Productos</h2>
        {!formOpen && categories.length > 0 && (
          <button
            onClick={startCreate}
            className="rounded-lg bg-brand-600 px-4 py-2 font-semibold text-white transition hover:bg-brand-700"
          >
            Nuevo producto
          </button>
        )}
      </div>

      {categories.length === 0 && products !== null && (
        <p className="mb-4 text-sm text-neutral-500">
          Creá primero una categoría en la sección Categorías.
        </p>
      )}

      {formOpen && (
        <ProductForm
          categories={categories}
          modifierGroups={modifierGroups}
          initial={editing}
          onSaved={handleSaved}
          onCancel={() => setFormOpen(false)}
        />
      )}

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {products === null ? (
        <p className="text-neutral-500">Cargando...</p>
      ) : (
        categories.map((category) => {
          const items = grouped.get(category.id) ?? [];
          if (items.length === 0) return null;
          return (
            <div key={category.id} className="mb-6">
              <h3 className="mb-2 font-semibold text-neutral-700">
                {category.name}
              </h3>
              <ul className="divide-y divide-neutral-200 rounded-2xl border border-neutral-200 bg-white shadow-sm">
                {items.map((product, idx) => (
                  <li
                    key={product.id}
                    className={
                      "flex items-center justify-between gap-4 px-6 py-4 " +
                      (product.available ? "" : "bg-neutral-50")
                    }
                  >
                    <div className="flex items-center gap-4">
                      <div className="flex flex-col gap-0.5">
                        <button
                          type="button"
                          onClick={() => moveProduct(product, -1)}
                          disabled={idx === 0}
                          aria-label="Subir"
                          className="rounded border border-neutral-300 px-1.5 text-neutral-500 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-30"
                        >
                          ▲
                        </button>
                        <button
                          type="button"
                          onClick={() => moveProduct(product, 1)}
                          disabled={idx === items.length - 1}
                          aria-label="Bajar"
                          className="rounded border border-neutral-300 px-1.5 text-neutral-500 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-30"
                        >
                          ▼
                        </button>
                      </div>
                      <div>
                      <p className="flex items-center gap-2 font-medium text-neutral-900">
                        <span className={product.available ? "" : "text-neutral-400"}>
                          {product.name}
                        </span>
                        {!product.available && (
                          <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-xs font-medium text-neutral-600">
                            Oculto en la carta
                          </span>
                        )}
                      </p>
                      <p className="text-sm text-neutral-500">
                        {product.discountPrice != null ? (
                          <>
                            <span className="mr-2 line-through">
                              {formatCurrency(product.price)}
                            </span>
                            <span className="font-medium text-brand-600">
                              {formatCurrency(product.discountPrice)}
                            </span>
                          </>
                        ) : (
                          formatCurrency(product.price)
                        )}
                        {!product.availableDelivery && " · Sin delivery"}
                        {!product.availablePickup && " · Sin retiro"}
                      </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => toggleStock(product)}
                        disabled={togglingId === product.id}
                        className={
                          "rounded-lg border px-2.5 py-1 text-sm font-medium disabled:opacity-50 " +
                          (product.available
                            ? "border-neutral-300 text-neutral-600 hover:bg-neutral-100"
                            : "border-green-500 text-green-700 hover:bg-green-50")
                        }
                      >
                        {togglingId === product.id
                          ? "..."
                          : product.available
                            ? "Ocultar (sin stock)"
                            : "Mostrar en la carta"}
                      </button>
                      <button
                        onClick={() => startEdit(product)}
                        className="text-sm font-medium text-brand-600 hover:underline"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => handleDelete(product)}
                        className="text-sm font-medium text-red-600 hover:underline"
                      >
                        Eliminar
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          );
        })
      )}
    </div>
  );
}
