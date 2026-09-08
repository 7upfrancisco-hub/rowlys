"use client";

import { useState } from "react";
import {
  formatCurrency,
  type CategoryDTO,
  type ProductDTO,
} from "@/types";

// Piezas compartidas para elegir productos de un pedido: las usan el modal de
// "Nuevo pedido" y el de "Editar pedido" en /comanda.

export interface DraftLine {
  key: string;
  // Presente solo en líneas nuevas (elegidas del menú). Las líneas que ya
  // estaban en el pedido no tienen productId acá (se conservan por snapshot).
  productId?: string;
  // Presente solo en líneas que ya estaban en el pedido.
  keepItemId?: string;
  name: string;
  unitPrice: number;
  quantity: number;
  notes?: string;
  options: { optionId?: string; name: string; price: number }[];
}

// Firma para deduplicar / juntar líneas equivalentes.
export function lineKey(
  productId: string,
  optionIds: string[],
  notes: string | undefined
): string {
  return [productId, [...optionIds].sort().join("+"), notes ?? ""].join("|");
}

export function lineSubtotal(l: DraftLine): number {
  const opt = l.options.reduce((s, o) => s + o.price, 0);
  return (l.unitPrice + opt) * l.quantity;
}

// Columna de menú: pestañas de categoría + lista de productos.
export function MenuColumn({
  menu,
  onPick,
}: {
  menu: CategoryDTO[] | null;
  onPick: (product: ProductDTO) => void;
}) {
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(
    menu?.[0]?.id ?? null
  );
  if (menu === null) {
    return <p className="text-sm text-neutral-500">Cargando menú...</p>;
  }
  const active =
    menu.find((c) => c.id === activeCategoryId) ?? menu[0] ?? null;

  return (
    <>
      <div className="mb-2 flex gap-1 overflow-x-auto">
        {menu.map((c) => (
          <button
            key={c.id}
            onClick={() => setActiveCategoryId(c.id)}
            className={
              "whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-medium " +
              ((active?.id ?? menu[0]?.id) === c.id
                ? "bg-brand-50 text-brand-700"
                : "text-neutral-500 hover:bg-neutral-100")
            }
          >
            {c.name}
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-1.5">
        {active?.products.map((p) => {
          const price = p.discountPrice ?? p.price;
          const hasGroups = p.modifierGroups.some((g) => g.active);
          return (
            <button
              key={p.id}
              onClick={() => onPick(p)}
              className="flex items-center justify-between gap-2 rounded-lg border border-neutral-200 px-3 py-2 text-left text-sm hover:border-brand-300 hover:bg-brand-50/40"
            >
              <span className="text-neutral-800">
                {p.name}
                {hasGroups && (
                  <span className="ml-1 text-xs text-neutral-400">
                    (con opciones)
                  </span>
                )}
              </span>
              <span className="shrink-0 font-medium text-neutral-500">
                {formatCurrency(price)}
              </span>
            </button>
          );
        })}
        {active?.products.length === 0 && (
          <p className="text-sm text-neutral-400">
            Sin productos en esta categoría.
          </p>
        )}
      </div>
    </>
  );
}

// Panel para elegir adicionales + cantidad + nota de un producto con opciones.
export function ProductOptionsPanel({
  product,
  onClose,
  onAdd,
}: {
  product: ProductDTO;
  onClose: () => void;
  onAdd: (line: Omit<DraftLine, "key">) => void;
}) {
  const activeGroups = product.modifierGroups.filter((g) => g.active);
  const [selection, setSelection] = useState<Record<string, string[]>>({});
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState("");

  function toggleOption(groupId: string, optionId: string, max: number) {
    setSelection((prev) => {
      const current = prev[groupId] ?? [];
      if (current.includes(optionId)) {
        return { ...prev, [groupId]: current.filter((id) => id !== optionId) };
      }
      if (max === 1) return { ...prev, [groupId]: [optionId] };
      if (current.length >= max) return prev;
      return { ...prev, [groupId]: [...current, optionId] };
    });
  }

  const canAdd = activeGroups.every((g) => {
    const count = (selection[g.id] ?? []).length;
    return count >= g.min && count <= g.max;
  });

  const unitPrice = product.discountPrice ?? product.price;
  const optionsPrice = activeGroups.reduce((sum, g) => {
    const chosen = selection[g.id] ?? [];
    return (
      sum +
      g.options
        .filter((o) => chosen.includes(o.id))
        .reduce((s, o) => s + o.price, 0)
    );
  }, 0);

  function handleAdd() {
    const options = activeGroups.flatMap((g) => {
      const chosen = selection[g.id] ?? [];
      return g.options
        .filter((o) => chosen.includes(o.id))
        .map((o) => ({ optionId: o.id, name: o.title, price: o.price }));
    });
    onAdd({
      productId: product.id,
      name: product.name,
      unitPrice,
      quantity,
      notes: notes.trim() || undefined,
      options,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center">
      <div className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl">
        <h3 className="text-base font-bold text-neutral-900">{product.name}</h3>
        <p className="mt-1 text-sm font-semibold text-brand-600">
          {formatCurrency(unitPrice)}
        </p>

        {activeGroups.map((group) => (
          <div key={group.id} className="mt-4">
            <p className="mb-2 text-sm font-medium text-neutral-800">
              {group.name}{" "}
              <span className="text-neutral-400">
                ({group.min > 0 ? `mín ${group.min}, ` : ""}máx {group.max})
              </span>
            </p>
            <div className="flex flex-col gap-1.5">
              {group.options
                .filter((o) => o.active)
                .map((option) => {
                  const checked = (selection[group.id] ?? []).includes(
                    option.id
                  );
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() =>
                        toggleOption(group.id, option.id, group.max)
                      }
                      className={
                        "flex items-center justify-between rounded-lg border px-3 py-2 text-left text-sm " +
                        (checked
                          ? "border-brand-500 bg-brand-50 text-brand-700"
                          : "border-neutral-200 text-neutral-700")
                      }
                    >
                      <span>{option.title}</span>
                      {option.price > 0 && (
                        <span>+{formatCurrency(option.price)}</span>
                      )}
                    </button>
                  );
                })}
            </div>
          </div>
        ))}

        <input
          placeholder="Nota para este ítem (opcional)"
          value={notes}
          onChange={(e) => setNotes(e.target.value.slice(0, 150))}
          className="mt-4 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
        />

        <div className="mt-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              className="h-8 w-8 rounded-full border border-neutral-300 font-bold text-neutral-600"
            >
              −
            </button>
            <span className="w-5 text-center font-medium">{quantity}</span>
            <button
              onClick={() => setQuantity((q) => q + 1)}
              className="h-8 w-8 rounded-full border border-neutral-300 font-bold text-neutral-600"
            >
              +
            </button>
          </div>
          <button
            onClick={handleAdd}
            disabled={!canAdd}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-40"
          >
            Agregar ({formatCurrency((unitPrice + optionsPrice) * quantity)})
          </button>
        </div>
        <button
          onClick={onClose}
          className="mt-3 w-full text-center text-sm font-medium text-neutral-500 hover:underline"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
