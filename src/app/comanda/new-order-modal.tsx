"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api-client";
import {
  formatCurrency,
  ORDER_TYPE_LABELS,
  type CategoryDTO,
  type OrderType,
  type PaymentProvider,
  type ProductDTO,
} from "@/types";
import {
  MenuColumn,
  ProductOptionsPanel,
  lineKey,
  type DraftLine,
} from "./order-line-picker";

// Carga manual de un pedido desde la comanda (cliente que pide en el local o
// por teléfono). Estado local propio — no usa el carrito del cliente (zustand).

const PAYMENT_CHOICES: { value: PaymentProvider; label: string }[] = [
  { value: "CASH", label: "Efectivo" },
  { value: "BANK_TRANSFER", label: "Transferencia" },
];

export default function NewOrderModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [menu, setMenu] = useState<CategoryDTO[] | null>(null);
  const [deliveryFee, setDeliveryFee] = useState(0);

  const [orderType, setOrderType] = useState<OrderType>("PICKUP");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentProvider>("CASH");
  const [changeFor, setChangeFor] = useState("");
  const [generalNotes, setGeneralNotes] = useState("");

  const [lines, setLines] = useState<DraftLine[]>([]);
  const [detailProduct, setDetailProduct] = useState<ProductDTO | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<CategoryDTO[]>("/api/menu")
      .then(setMenu)
      .catch((err: ApiError) => setError(err.message));
    apiFetch<{ deliveryFee?: number }>("/api/settings")
      .then((s) => setDeliveryFee(s.deliveryFee ?? 0))
      .catch(() => {});
  }, []);

  // Cerrar con Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function addLine(line: Omit<DraftLine, "key">) {
    const key = lineKey(
      line.productId ?? line.name,
      line.options.map((o) => o.optionId ?? o.name),
      line.notes
    );
    setLines((prev) => {
      const existing = prev.find((l) => l.key === key);
      if (existing) {
        return prev.map((l) =>
          l.key === key ? { ...l, quantity: l.quantity + line.quantity } : l
        );
      }
      return [...prev, { ...line, key }];
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
    () =>
      lines.reduce((sum, l) => {
        const opt = l.options.reduce((s, o) => s + o.price, 0);
        return sum + (l.unitPrice + opt) * l.quantity;
      }, 0),
    [lines]
  );
  const fee = orderType === "DELIVERY" ? deliveryFee : 0;
  const total = itemsTotal + fee;

  const canSubmit =
    firstName.trim().length > 0 &&
    lines.length > 0 &&
    (orderType !== "DELIVERY" || address.trim().length > 0) &&
    !submitting;

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch("/api/admin/orders", {
        method: "POST",
        body: JSON.stringify({
          orderType,
          customerFirstName: firstName.trim(),
          customerLastName: lastName.trim() || undefined,
          customerPhone: phone.trim() || undefined,
          deliveryAddress:
            orderType === "DELIVERY" ? address.trim() : undefined,
          notes: generalNotes.trim() || undefined,
          paymentMethod,
          changeFor:
            paymentMethod === "CASH" && Number(changeFor) > 0
              ? Number(changeFor)
              : undefined,
          items: lines.map((l) => ({
            productId: l.productId,
            quantity: l.quantity,
            notes: l.notes,
            optionIds: l.options
              .map((o) => o.optionId)
              .filter((id): id is string => !!id),
          })),
        }),
      });
      onCreated();
      onClose();
    } catch (err) {
      setError((err as ApiError).message);
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/50 sm:items-center">
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-3">
          <h2 className="font-bold text-neutral-900">Nuevo pedido</h2>
          <button
            onClick={onClose}
            className="text-sm font-medium text-neutral-500 hover:text-neutral-800"
          >
            Cerrar
          </button>
        </div>

        <div className="grid flex-1 gap-5 overflow-y-auto p-5 sm:grid-cols-2">
          {/* Columna izquierda: menú */}
          <div className="flex flex-col">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">
              Productos
            </p>
            <MenuColumn menu={menu} onPick={quickAdd} />
          </div>

          {/* Columna derecha: datos + carrito */}
          <div className="flex flex-col gap-4">
            <div className="flex gap-1">
              {(Object.keys(ORDER_TYPE_LABELS) as OrderType[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setOrderType(t)}
                  className={
                    "flex-1 rounded-lg px-3 py-2 text-sm font-medium " +
                    (orderType === t
                      ? "bg-brand-600 text-white"
                      : "border border-neutral-300 text-neutral-600")
                  }
                >
                  {ORDER_TYPE_LABELS[t]}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <input
                placeholder="Nombre *"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
              />
              <input
                placeholder="Apellido"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
              />
              <input
                placeholder="Teléfono"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="col-span-2 rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
              />
              {orderType === "DELIVERY" && (
                <input
                  placeholder="Dirección de envío *"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="col-span-2 rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
                />
              )}
            </div>

            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-400">
                En el pedido
              </p>
              {lines.length === 0 ? (
                <p className="rounded-lg border border-dashed border-neutral-300 px-3 py-4 text-center text-sm text-neutral-400">
                  Tocá un producto para agregarlo.
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

            <div className="flex gap-1">
              {PAYMENT_CHOICES.map((p) => (
                <button
                  key={p.value}
                  onClick={() => setPaymentMethod(p.value)}
                  className={
                    "flex-1 rounded-lg px-3 py-2 text-sm font-medium " +
                    (paymentMethod === p.value
                      ? "bg-brand-600 text-white"
                      : "border border-neutral-300 text-neutral-600")
                  }
                >
                  {p.label}
                </button>
              ))}
            </div>
            {paymentMethod === "CASH" && (
              <input
                inputMode="numeric"
                placeholder="¿Con cuánto paga? (opcional)"
                value={changeFor}
                onChange={(e) =>
                  setChangeFor(e.target.value.replace(/[^\d]/g, ""))
                }
                className="rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
              />
            )}

            <textarea
              placeholder="Nota del pedido (opcional)"
              value={generalNotes}
              onChange={(e) => setGeneralNotes(e.target.value.slice(0, 200))}
              rows={2}
              className="rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
            />
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
              {orderType === "DELIVERY" && fee > 0
                ? `Productos ${formatCurrency(itemsTotal)} + envío ${formatCurrency(fee)}`
                : "Total"}
            </span>
            <span className="text-lg font-bold text-neutral-900">
              {formatCurrency(total)}
            </span>
          </div>
          <button
            onClick={submit}
            disabled={!canSubmit}
            className="w-full rounded-lg bg-brand-600 px-4 py-2.5 font-semibold text-white hover:bg-brand-700 disabled:opacity-40"
          >
            {submitting ? "Creando..." : "Crear pedido"}
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
