"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api-client";
import { formatCurrency, type CategoryDTO, type OrderDTO, type ProductDTO } from "@/types";
import {
  MenuColumn,
  ProductOptionsPanel,
  lineSubtotal,
  type DraftLine,
} from "./order-line-picker";

// Editar los ítems y la nota de un pedido en curso desde /comanda. Recalcula el
// total y el monto del pago en el servidor.

function sig(productKey: string, optionNames: string[], notes?: string): string {
  return [productKey, [...optionNames].sort().join("+"), notes ?? ""].join("|");
}

function lineSig(l: DraftLine): string {
  return sig(
    l.productId ?? l.name,
    l.options.map((o) => o.name),
    l.notes
  );
}

export default function EditOrderModal({
  order,
  onClose,
  onSaved,
}: {
  order: OrderDTO;
  onClose: () => void;
  onSaved: (updated: OrderDTO) => void;
}) {
  const [menu, setMenu] = useState<CategoryDTO[] | null>(null);
  const [lines, setLines] = useState<DraftLine[]>(() =>
    order.items.map((it) => ({
      key: "keep:" + it.id,
      keepItemId: it.id,
      name: it.productName,
      unitPrice: it.price,
      quantity: it.quantity,
      notes: it.notes ?? undefined,
      options: it.options.map((o) => ({ name: o.name, price: o.price })),
    }))
  );
  const [note, setNote] = useState(order.notes ?? "");
  const [detailProduct, setDetailProduct] = useState<ProductDTO | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<CategoryDTO[]>("/api/menu")
      .then(setMenu)
      .catch((err: ApiError) => setError(err.message));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function addLine(line: Omit<DraftLine, "key">) {
    const s = sig(
      line.productId ?? line.name,
      line.options.map((o) => o.name),
      line.notes
    );
    setLines((prev) => {
      const idx = prev.findIndex((l) => lineSig(l) === s);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = {
          ...copy[idx],
          quantity: copy[idx].quantity + line.quantity,
        };
        return copy;
      }
      return [
        ...prev,
        { ...line, key: "new:" + s + ":" + Math.random().toString(36).slice(2, 7) },
      ];
    });
  }

  function setQuantity(key: string, quantity: number) {
    setLines((prev) =>
      quantity <= 0
        ? prev.filter((l) => l.key !== key)
        : prev.map((l) => (l.key === key ? { ...l, quantity } : l))
    );
  }

  function quickAdd(product: ProductDTO) {
    const activeGroups = product.modifierGroups.filter((g) => g.active);
    if (activeGroups.length > 0) {
      setDetailProduct(product);
      return;
    }
    addLine({
      productId: product.id,
      name: product.name,
      unitPrice: product.discountPrice ?? product.price,
      quantity: 1,
      options: [],
    });
  }

  const itemsTotal = useMemo(
    () => lines.reduce((s, l) => s + lineSubtotal(l), 0),
    [lines]
  );
  const total = itemsTotal + order.deliveryFee;

  const originalShape = useMemo(
    () =>
      order.items
        .map((it) => `${it.id}:${it.quantity}`)
        .sort()
        .join("|"),
    [order.items]
  );
  const currentShape = lines
    .map((l) => `${l.keepItemId ?? l.key}:${l.quantity}`)
    .sort()
    .join("|");
  const changed =
    currentShape !== originalShape ||
    (note.trim() || null) !== (order.notes ?? null);

  const paid = order.payment?.status === "CONFIRMED";

  async function save() {
    if (lines.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await apiFetch<OrderDTO>(
        `/api/admin/orders/${order.id}/items`,
        {
          method: "POST",
          body: JSON.stringify({
            notes: note.trim(),
            lines: lines.map((l) =>
              l.keepItemId
                ? { keepItemId: l.keepItemId, quantity: l.quantity }
                : {
                    productId: l.productId,
                    quantity: l.quantity,
                    notes: l.notes,
                    optionIds: l.options
                      .map((o) => o.optionId)
                      .filter((id): id is string => !!id),
                  }
            ),
          }),
        }
      );
      onSaved(updated);
      onClose();
    } catch (err) {
      setError((err as ApiError).message);
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/50 sm:items-center">
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-3">
          <h2 className="font-bold text-neutral-900">
            Editar pedido #{order.number}
          </h2>
          <button
            onClick={onClose}
            className="text-sm font-medium text-neutral-500 hover:text-neutral-800"
          >
            Cerrar
          </button>
        </div>

        <div className="grid flex-1 gap-5 overflow-y-auto p-5 sm:grid-cols-2">
          <div className="flex flex-col">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">
              Agregar productos
            </p>
            <MenuColumn menu={menu} onPick={quickAdd} />
          </div>

          <div className="flex flex-col gap-4">
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-400">
                En el pedido
              </p>
              {lines.length === 0 ? (
                <p className="rounded-lg border border-dashed border-red-300 px-3 py-4 text-center text-sm text-red-500">
                  El pedido no puede quedar sin ítems.
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {lines.map((l) => (
                    <li
                      key={l.key}
                      className="flex items-start justify-between gap-2 border-b border-neutral-100 pb-2 text-sm"
                    >
                      <div>
                        <p className="font-medium text-neutral-800">{l.name}</p>
                        {l.options.length > 0 && (
                          <p className="text-xs text-neutral-500">
                            {l.options.map((o) => o.name).join(", ")}
                          </p>
                        )}
                        {l.notes && (
                          <p className="text-xs italic text-neutral-500">
                            “{l.notes}”
                          </p>
                        )}
                        <p className="text-xs text-neutral-400">
                          {formatCurrency(
                            l.unitPrice +
                              l.options.reduce((s, o) => s + o.price, 0)
                          )}{" "}
                          c/u
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => setQuantity(l.key, l.quantity - 1)}
                          className="h-6 w-6 rounded-full border border-neutral-300 font-bold text-neutral-600"
                        >
                          −
                        </button>
                        <span className="w-5 text-center">{l.quantity}</span>
                        <button
                          onClick={() => setQuantity(l.key, l.quantity + 1)}
                          className="h-6 w-6 rounded-full border border-neutral-300 font-bold text-neutral-600"
                        >
                          +
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <textarea
              placeholder="Nota del pedido (opcional)"
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, 200))}
              rows={2}
              className="rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
            />

            {paid && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Este pedido ya figura como pagado
                {order.payment
                  ? ` (${
                      order.payment.provider === "MP"
                        ? "Mercado Pago"
                        : order.payment.provider === "CASH"
                          ? "efectivo"
                          : "transferencia"
                    })`
                  : ""}
                . Si cambiás el total, ajustá la diferencia con el cliente — no se
                cobra automáticamente.
              </p>
            )}
          </div>
        </div>

        <div className="border-t border-neutral-200 px-5 py-3">
          {error && (
            <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
              {error}
            </p>
          )}
          <div className="mb-2 flex items-center justify-between text-sm text-neutral-600">
            <span>
              {order.deliveryFee > 0
                ? `Productos ${formatCurrency(itemsTotal)} + envío ${formatCurrency(
                    order.deliveryFee
                  )}`
                : "Total"}
            </span>
            <span className="text-lg font-bold text-neutral-900">
              {formatCurrency(total)}
              {total !== order.total && (
                <span className="ml-2 text-xs font-normal text-neutral-400">
                  antes {formatCurrency(order.total)}
                </span>
              )}
            </span>
          </div>
          <button
            onClick={save}
            disabled={saving || lines.length === 0 || !changed}
            className="w-full rounded-lg bg-brand-600 px-4 py-2.5 font-semibold text-white hover:bg-brand-700 disabled:opacity-40"
          >
            {saving ? "Guardando..." : "Guardar cambios"}
          </button>
        </div>
      </div>

      {detailProduct && (
        <ProductOptionsPanel
          product={detailProduct}
          onClose={() => setDetailProduct(null)}
          onAdd={(line) => {
            addLine(line);
            setDetailProduct(null);
          }}
        />
      )}
    </div>
  );
}
