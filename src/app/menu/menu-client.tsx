"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api-client";
import { useCartStore, cartLineKey, cartSubtotal } from "@/lib/cart-store";
import {
  formatCurrency,
  ORDER_TYPE_LABELS,
  type CategoryDTO,
  type ProductDTO,
  type OrderType,
} from "@/types";

export default function MenuClient() {
  const router = useRouter();
  const [categories, setCategories] = useState<CategoryDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [detailProduct, setDetailProduct] = useState<ProductDTO | null>(null);
  const [cartOpen, setCartOpen] = useState(false);

  const orderType = useCartStore((s) => s.orderType);
  const setOrderType = useCartStore((s) => s.setOrderType);
  const lines = useCartStore((s) => s.lines);

  useEffect(() => {
    apiFetch<CategoryDTO[]>("/api/menu")
      .then((data) => {
        setCategories(data);
        if (data.length > 0) setActiveCategoryId(data[0].id);
      })
      .catch((err: ApiError) => setError(err.message));
  }, []);

  const activeCategory = categories?.find((c) => c.id === activeCategoryId) ?? null;
  const subtotal = useMemo(() => cartSubtotal(lines), [lines]);

  return (
    <div className="min-h-screen bg-neutral-50 pb-24">
      <header className="border-b border-neutral-200 bg-white px-6 py-4">
        <h1 className="text-xl font-bold text-brand-600">Rowlys</h1>

        <div className="mt-3 flex gap-1">
          {(Object.keys(ORDER_TYPE_LABELS) as OrderType[]).map((type) => (
            <button
              key={type}
              onClick={() => setOrderType(type)}
              className={
                "rounded-lg px-3 py-2 text-sm font-medium transition " +
                (orderType === type
                  ? "bg-brand-600 text-white"
                  : "border border-neutral-300 text-neutral-600")
              }
            >
              {ORDER_TYPE_LABELS[type]}
            </button>
          ))}
        </div>
      </header>

      {error && <p className="px-6 py-4 text-sm text-red-600">{error}</p>}

      {categories === null ? (
        <p className="px-6 py-8 text-neutral-500">Cargando...</p>
      ) : (
        <>
          <nav className="flex gap-1 overflow-x-auto border-b border-neutral-200 bg-white px-6 py-3">
            {categories.map((category) => (
              <button
                key={category.id}
                onClick={() => setActiveCategoryId(category.id)}
                className={
                  "whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium " +
                  (activeCategoryId === category.id
                    ? "bg-brand-100 text-brand-700"
                    : "text-neutral-500 hover:bg-neutral-100")
                }
              >
                {category.name}
              </button>
            ))}
          </nav>

          <div className="grid grid-cols-1 gap-4 px-6 py-6 sm:grid-cols-2 lg:grid-cols-3">
            {activeCategory?.products.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                onOpen={() => setDetailProduct(product)}
              />
            ))}
          </div>
        </>
      )}

      {lines.length > 0 && (
        <button
          onClick={() => setCartOpen(true)}
          className="fixed inset-x-6 bottom-6 rounded-xl bg-brand-600 px-4 py-4 text-center font-semibold text-white shadow-lg transition hover:bg-brand-700"
        >
          Ver mi carrito ({formatCurrency(subtotal)})
        </button>
      )}

      {detailProduct && (
        <ProductDetailOverlay
          product={detailProduct}
          onClose={() => setDetailProduct(null)}
        />
      )}

      {cartOpen && (
        <CartSheet
          onClose={() => setCartOpen(false)}
          onCheckout={() => router.push("/checkout")}
        />
      )}
    </div>
  );
}

function ProductCard({
  product,
  onOpen,
}: {
  product: ProductDTO;
  onOpen: () => void;
}) {
  const addLine = useCartStore((s) => s.addLine);
  const activeGroups = product.modifierGroups.filter((g) => g.active);

  return (
    <div
      onClick={onOpen}
      className="cursor-pointer rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm transition hover:border-brand-300 hover:shadow-md"
    >
      {product.imageUrl && (
        <img
          src={product.imageUrl}
          alt={product.name}
          className="mb-3 h-32 w-full rounded-lg object-cover"
        />
      )}
      <p className="font-medium text-neutral-900">{product.name}</p>
      {product.description && (
        <p className="mt-1 line-clamp-2 text-sm text-neutral-500">
          {product.description}
        </p>
      )}
      <div className="mt-2 flex items-center justify-between">
        <p className="text-sm">
          {product.discountPrice != null ? (
            <>
              <span className="mr-2 text-neutral-400 line-through">
                {formatCurrency(product.price)}
              </span>
              <span className="font-semibold text-brand-600">
                {formatCurrency(product.discountPrice)}
              </span>
            </>
          ) : (
            <span className="font-semibold text-neutral-900">
              {formatCurrency(product.price)}
            </span>
          )}
        </p>
        {activeGroups.length === 0 && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              addLine({
                productId: product.id,
                name: product.name,
                price: product.discountPrice ?? product.price,
              });
            }}
            className="rounded-full bg-brand-600 px-3 py-1 text-sm font-bold text-white hover:bg-brand-700"
          >
            +
          </button>
        )}
      </div>
    </div>
  );
}

function ProductDetailOverlay({
  product,
  onClose,
}: {
  product: ProductDTO;
  onClose: () => void;
}) {
  const addLine = useCartStore((s) => s.addLine);
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
      if (max === 1) {
        return { ...prev, [groupId]: [optionId] };
      }
      if (current.length >= max) return prev;
      return { ...prev, [groupId]: [...current, optionId] };
    });
  }

  const canAdd = activeGroups.every((group) => {
    const count = (selection[group.id] ?? []).length;
    return count >= group.min && count <= group.max;
  });

  const unitPrice = product.discountPrice ?? product.price;
  const optionsPrice = activeGroups.reduce((sum, group) => {
    const chosen = selection[group.id] ?? [];
    return (
      sum +
      group.options
        .filter((o) => chosen.includes(o.id))
        .reduce((s, o) => s + o.price, 0)
    );
  }, 0);

  function handleAdd() {
    const options = activeGroups.flatMap((group) => {
      const chosen = selection[group.id] ?? [];
      return group.options
        .filter((o) => chosen.includes(o.id))
        .map((o) => ({ optionId: o.id, name: o.title, price: o.price }));
    });
    addLine({
      productId: product.id,
      name: product.name,
      price: unitPrice,
      quantity,
      notes: notes.trim() || undefined,
      options,
    });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 sm:items-center">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-6 shadow-xl sm:rounded-2xl">
        {product.imageUrl && (
          <img
            src={product.imageUrl}
            alt={product.name}
            className="mb-4 h-48 w-full rounded-lg object-cover"
          />
        )}
        <h2 className="text-lg font-bold text-neutral-900">{product.name}</h2>
        {product.description && (
          <p className="mt-1 text-sm text-neutral-500">{product.description}</p>
        )}
        <p className="mt-2 font-semibold text-brand-600">
          {formatCurrency(unitPrice)}
        </p>

        {activeGroups.map((group) => (
          <div key={group.id} className="mt-5">
            <p className="mb-2 text-sm font-medium text-neutral-700">
              {group.name}{" "}
              <span className="text-neutral-400">
                ({group.min > 0 ? `mínimo ${group.min}, ` : ""}máximo {group.max})
              </span>
            </p>
            <div className="flex flex-col gap-2">
              {group.options
                .filter((o) => o.active)
                .map((option) => {
                  const checked = (selection[group.id] ?? []).includes(option.id);
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => toggleOption(group.id, option.id, group.max)}
                      className={
                        "flex items-center justify-between rounded-lg border px-4 py-2 text-left text-sm transition " +
                        (checked
                          ? "border-brand-500 bg-brand-50 text-brand-700"
                          : "border-neutral-300 text-neutral-700")
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

        <div className="mt-5 flex flex-col gap-1">
          <label className="text-sm font-medium text-neutral-700">
            ¿Querés aclarar algo? (opcional)
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value.slice(0, 150))}
            rows={2}
            className="rounded-lg border border-neutral-300 px-4 py-2 focus:border-brand-500 focus:outline-none"
          />
        </div>

        <div className="mt-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              className="h-9 w-9 rounded-full border border-neutral-300 font-bold text-neutral-700"
            >
              −
            </button>
            <span className="w-6 text-center font-medium">{quantity}</span>
            <button
              onClick={() => setQuantity((q) => q + 1)}
              className="h-9 w-9 rounded-full border border-neutral-300 font-bold text-neutral-700"
            >
              +
            </button>
          </div>
          <button
            onClick={handleAdd}
            disabled={!canAdd}
            className="rounded-lg bg-brand-600 px-5 py-3 font-semibold text-white transition hover:bg-brand-700 disabled:opacity-40"
          >
            Agregar ({formatCurrency((unitPrice + optionsPrice) * quantity)})
          </button>
        </div>

        <button
          onClick={onClose}
          className="mt-4 w-full text-center text-sm font-medium text-neutral-500 hover:underline"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

function CartSheet({
  onClose,
  onCheckout,
}: {
  onClose: () => void;
  onCheckout: () => void;
}) {
  const lines = useCartStore((s) => s.lines);
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const removeLine = useCartStore((s) => s.removeLine);
  const subtotal = cartSubtotal(lines);

  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 sm:items-center">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-6 shadow-xl sm:rounded-2xl">
        <h2 className="mb-4 text-lg font-bold text-neutral-900">Tu carrito</h2>

        {lines.length === 0 ? (
          <p className="text-neutral-500">Tu carrito está vacío.</p>
        ) : (
          <ul className="flex flex-col gap-4">
            {lines.map((line) => {
              const key = cartLineKey(line);
              const optionsPrice = (line.options ?? []).reduce(
                (s, o) => s + o.price,
                0
              );
              return (
                <li
                  key={key}
                  className="flex items-start justify-between gap-3 border-b border-neutral-100 pb-3"
                >
                  <div>
                    <p className="font-medium text-neutral-900">{line.name}</p>
                    {line.options && line.options.length > 0 && (
                      <p className="text-sm text-neutral-500">
                        {line.options.map((o) => o.name).join(", ")}
                      </p>
                    )}
                    {line.notes && (
                      <p className="text-sm italic text-neutral-400">
                        {line.notes}
                      </p>
                    )}
                    <p className="text-sm text-neutral-500">
                      {formatCurrency(line.price + optionsPrice)} c/u
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => updateQuantity(key, line.quantity - 1)}
                        className="h-7 w-7 rounded-full border border-neutral-300 font-bold text-neutral-700"
                      >
                        −
                      </button>
                      <span className="w-5 text-center">{line.quantity}</span>
                      <button
                        onClick={() => updateQuantity(key, line.quantity + 1)}
                        className="h-7 w-7 rounded-full border border-neutral-300 font-bold text-neutral-700"
                      >
                        +
                      </button>
                    </div>
                    <button
                      onClick={() => removeLine(key)}
                      className="text-xs font-medium text-red-600 hover:underline"
                    >
                      Quitar
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <div className="mt-4 flex items-center justify-between font-semibold text-neutral-900">
          <span>Subtotal</span>
          <span>{formatCurrency(subtotal)}</span>
        </div>

        <button
          onClick={onCheckout}
          disabled={lines.length === 0}
          className="mt-4 w-full rounded-lg bg-brand-600 px-4 py-3 font-semibold text-white transition hover:bg-brand-700 disabled:opacity-40"
        >
          Continuar al pago
        </button>
        <button
          onClick={onClose}
          className="mt-2 w-full text-center text-sm font-medium text-neutral-500 hover:underline"
        >
          Seguir viendo el menú
        </button>
      </div>
    </div>
  );
}
