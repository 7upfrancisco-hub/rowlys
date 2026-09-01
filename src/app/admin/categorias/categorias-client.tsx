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
  // Categoría en proceso de borrado que tiene productos: hay que decidir qué
  // hacer con ellos antes de confirmar.
  const [deleteTarget, setDeleteTarget] = useState<CategoryRow | null>(null);
  const [deleteMode, setDeleteMode] = useState<"withProducts" | "move">(
    "withProducts"
  );
  const [moveTo, setMoveTo] = useState("");
  const [deleting, setDeleting] = useState(false);

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

  function askDelete(category: CategoryRow) {
    setError(null);
    if (category._count.products === 0) {
      if (!confirm(`¿Eliminar la categoría "${category.name}"?`)) return;
      runDelete(category, null);
      return;
    }
    // Tiene productos: abrir el panel de decisión.
    const other = (categories ?? []).find((c) => c.id !== category.id);
    setDeleteTarget(category);
    setDeleteMode("withProducts");
    setMoveTo(other?.id ?? "");
  }

  async function runDelete(category: CategoryRow, moveProductsTo: string | null) {
    setDeleting(true);
    setError(null);
    try {
      const qs = moveProductsTo
        ? `?moveProductsTo=${encodeURIComponent(moveProductsTo)}`
        : "";
      await apiFetch(`/api/admin/categories/${category.id}${qs}`, {
        method: "DELETE",
      });
      setDeleteTarget(null);
      load();
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setDeleting(false);
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
                  onClick={() => askDelete(category)}
                  className="text-sm font-medium text-red-600 hover:underline"
                >
                  Eliminar
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {deleteTarget && (
        <DeleteCategoryDialog
          category={deleteTarget}
          otherCategories={(categories ?? []).filter(
            (c) => c.id !== deleteTarget.id
          )}
          mode={deleteMode}
          setMode={setDeleteMode}
          moveTo={moveTo}
          setMoveTo={setMoveTo}
          busy={deleting}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() =>
            runDelete(
              deleteTarget,
              deleteMode === "move" ? moveTo : null
            )
          }
        />
      )}
    </div>
  );
}

function DeleteCategoryDialog({
  category,
  otherCategories,
  mode,
  setMode,
  moveTo,
  setMoveTo,
  busy,
  onCancel,
  onConfirm,
}: {
  category: CategoryRow;
  otherCategories: CategoryRow[];
  mode: "withProducts" | "move";
  setMode: (m: "withProducts" | "move") => void;
  moveTo: string;
  setMoveTo: (id: string) => void;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const n = category._count.products;
  const canMove = otherCategories.length > 0;

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h3 className="text-lg font-bold text-neutral-900">
          Eliminar &ldquo;{category.name}&rdquo;
        </h3>
        <p className="mt-1 text-sm text-neutral-500">
          Esta categoría tiene {n} producto{n === 1 ? "" : "s"}. ¿Qué hacemos con
          {n === 1 ? " él" : " ellos"}?
        </p>

        <div className="mt-4 flex flex-col gap-3">
          <label className="flex items-start gap-2 text-sm text-neutral-700">
            <input
              type="radio"
              name="delmode"
              checked={mode === "withProducts"}
              onChange={() => setMode("withProducts")}
              className="mt-0.5"
            />
            <span>
              Eliminar también {n === 1 ? "el producto" : `los ${n} productos`}.
              <span className="block text-xs text-neutral-400">
                Si alguno tiene pedidos registrados, no se podrá borrar y te aviso
                cuál.
              </span>
            </span>
          </label>

          <label
            className={
              "flex items-start gap-2 text-sm " +
              (canMove ? "text-neutral-700" : "text-neutral-300")
            }
          >
            <input
              type="radio"
              name="delmode"
              disabled={!canMove}
              checked={mode === "move"}
              onChange={() => setMode("move")}
              className="mt-0.5"
            />
            <span className="flex-1">
              Mover los productos a otra categoría:
              <select
                value={moveTo}
                onChange={(e) => setMoveTo(e.target.value)}
                disabled={!canMove || mode !== "move"}
                className="mt-1 block w-full rounded-lg border border-neutral-300 px-3 py-1.5 text-sm disabled:opacity-50"
              >
                {otherCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              {!canMove && (
                <span className="block text-xs text-neutral-400">
                  No hay otra categoría a la que moverlos.
                </span>
              )}
            </span>
          </label>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onCancel}
            disabled={busy}
            className="text-sm font-medium text-neutral-500 hover:underline disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={busy || (mode === "move" && !moveTo)}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
          >
            {busy ? "Eliminando..." : "Eliminar categoría"}
          </button>
        </div>
      </div>
    </div>
  );
}
