"use client";

import { useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api-client";

interface CategoryRow {
  id: string;
  name: string;
  order: number;
  _count: { products: number };
}

export default function CategoriasClient() {
  const [categories, setCategories] = useState<CategoryRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<CategoryRow | null>(null);
  const [name, setName] = useState("");
  const [order, setOrder] = useState(0);
  const [saving, setSaving] = useState(false);

  function load() {
    apiFetch<CategoryRow[]>("/api/admin/categories")
      .then(setCategories)
      .catch((err: ApiError) => setError(err.message));
  }

  useEffect(load, []);

  function startCreate() {
    setEditing(null);
    setName("");
    setOrder((categories?.length ?? 0) * 10);
    setError(null);
  }

  function startEdit(category: CategoryRow) {
    setEditing(category);
    setName(category.name);
    setOrder(category.order);
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      if (editing) {
        await apiFetch(`/api/admin/categories/${editing.id}`, {
          method: "PATCH",
          body: JSON.stringify({ name, order }),
        });
      } else {
        await apiFetch("/api/admin/categories", {
          method: "POST",
          body: JSON.stringify({ name, order }),
        });
      }
      setEditing(null);
      setName("");
      load();
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(category: CategoryRow) {
    if (!confirm(`¿Eliminar la categoría "${category.name}"?`)) return;
    setError(null);
    try {
      await apiFetch(`/api/admin/categories/${category.id}`, {
        method: "DELETE",
      });
      load();
    } catch (err) {
      setError((err as ApiError).message);
    }
  }

  return (
    <div>
      <h2 className="mb-6 text-2xl font-bold text-neutral-900">Categorías</h2>

      <form
        onSubmit={handleSubmit}
        className="mb-8 flex flex-wrap items-end gap-3 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm"
      >
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-neutral-700">
            Nombre
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-lg border border-neutral-300 px-4 py-2 focus:border-brand-500 focus:outline-none"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-neutral-700">
            Orden
          </label>
          <input
            type="number"
            value={order}
            onChange={(e) => setOrder(Number(e.target.value))}
            className="w-24 rounded-lg border border-neutral-300 px-4 py-2 focus:border-brand-500 focus:outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={saving || !name.trim()}
          className="rounded-lg bg-brand-600 px-4 py-2 font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
        >
          {editing ? "Guardar cambios" : "Agregar categoría"}
        </button>
        {editing && (
          <button
            type="button"
            onClick={startCreate}
            className="text-sm font-medium text-neutral-500 hover:underline"
          >
            Cancelar edición
          </button>
        )}
      </form>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {categories === null ? (
        <p className="text-neutral-500">Cargando...</p>
      ) : categories.length === 0 ? (
        <p className="text-neutral-500">Todavía no hay categorías.</p>
      ) : (
        <ul className="divide-y divide-neutral-200 rounded-2xl border border-neutral-200 bg-white shadow-sm">
          {categories.map((category) => (
            <li
              key={category.id}
              className="flex items-center justify-between gap-4 px-6 py-4"
            >
              <div>
                <p className="font-medium text-neutral-900">
                  {category.name}
                </p>
                <p className="text-sm text-neutral-500">
                  Orden {category.order} · {category._count.products}{" "}
                  producto(s)
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => startEdit(category)}
                  className="text-sm font-medium text-brand-600 hover:underline"
                >
                  Editar
                </button>
                <button
                  onClick={() => handleDelete(category)}
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
