"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api-client";
import ThemeToggle from "@/components/ThemeToggle";
import { useCartStore, cartLineKey, cartSubtotal } from "@/lib/cart-store";
import {
  formatCurrency,
  ORDER_TYPE_LABELS,
  type CategoryDTO,
  type ProductDTO,
  type OrderType,
} from "@/types";

interface StoreInfo {
  storeName: string;
  storeOpen: boolean;
  deliveryEnabled: boolean;
  pickupEnabled: boolean;
  closedTitle: string | null;
  closedMessage: string | null;
  closedImageUrl: string | null;
}

function channelEnabled(info: StoreInfo | null, type: OrderType): boolean {
  if (!info) return true;
  return type === "DELIVERY" ? info.deliveryEnabled : info.pickupEnabled;
}

const BYPASS_KEY = "rowlys-store-bypass";

export default function MenuClient() {
  const router = useRouter();
  const [categories, setCategories] = useState<CategoryDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [detailProduct, setDetailProduct] = useState<ProductDTO | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [storeInfo, setStoreInfo] = useState<StoreInfo | null>(null);
  // Si el local está cerrado, se muestra primero el cartel. "Ver el menú"
  // lo saltea por lo que dure la sesión del navegador.
  const [viewMenuAnyway, setViewMenuAnyway] = useState(false);

  const orderType = useCartStore((s) => s.orderType);
  const setOrderType = useCartStore((s) => s.setOrderType);
  const lines = useCartStore((s) => s.lines);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(BYPASS_KEY) === "1") setViewMenuAnyway(true);
    } catch {
      /* storage bloqueado: se muestra el cartel siempre */
    }
    apiFetch<CategoryDTO[]>("/api/menu")
      .then((data) => {
        setCategories(data);
        if (data.length > 0) setActiveCategoryId(data[0].id);
      })
      .catch((err: ApiError) => setError(err.message));
    apiFetch<StoreInfo>("/api/settings")
      .then((s) => setStoreInfo(s))
      .catch(() => {});
  }, []);

  function viewMenu() {
    try {
      sessionStorage.setItem(BYPASS_KEY, "1");
    } catch {
      /* ignore */
    }
    setViewMenuAnyway(true);
  }
  function backToClosed() {
    try {
      sessionStorage.removeItem(BYPASS_KEY);
    } catch {
      /* ignore */
    }
    setViewMenuAnyway(false);
  }

  const activeCategory = categories?.find((c) => c.id === activeCategoryId) ?? null;
  const subtotal = useMemo(() => cartSubtotal(lines), [lines]);

  const storeClosed = !!storeInfo && !storeInfo.storeOpen;
  // Cerrado => el menú es solo para mirar (sin carrito ni checkout).
  const readOnly = storeClosed;
  // Local abierto pero un canal puntual pausado: el carrito sigue, se bloquea
  // solo en el checkout.
  const channelPaused = !storeClosed && !channelEnabled(storeInfo, orderType);
  const orderBlockedReason =
    orderType === "DELIVERY"
      ? "El envío a domicilio está pausado"
      : "El retiro en el local está pausado";

  // Cartel de cerrado (antes del menú).
  if (storeClosed && !viewMenuAnyway) {
    return (
      <div className="storefront min-h-screen">
        <ThemeToggle />
        <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 px-6 py-12 text-center">
          <button
            type="button"
            onClick={viewMenu}
            className="rounded-lg border border-line bg-surface px-5 py-2.5 text-sm font-medium text-fg transition hover:bg-surface-2"
          >
            Ver el menú →
          </button>

          {storeInfo?.closedImageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={storeInfo.closedImageUrl}
              alt=""
              className="max-h-64 w-full rounded-2xl border border-line object-cover"
            />
          )}

          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted">
              {storeInfo?.storeName ?? "Rowlys"}
            </p>
            <h1 className="mt-1 text-2xl font-bold text-accent">
              {storeInfo?.closedTitle || "Estamos cerrados"}
            </h1>
          </div>

          {storeInfo?.closedMessage && (
            <p className="whitespace-pre-line text-sm text-muted">
              {storeInfo.closedMessage}
            </p>
          )}

          <p className="text-xs text-muted">
            Podés ver el menú, pero no se pueden hacer pedidos ahora.
          </p>
        </main>
      </div>
    );
  }

  return (
    <div className={"storefront min-h-screen " + (readOnly ? "" : "pb-24")}>
      <ThemeToggle />

      {readOnly && (
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-line bg-store-500/10 px-6 py-2 text-sm">
          <span className="font-medium text-accent">
            {storeInfo?.closedTitle || "Estamos cerrados"} · solo podés ver el menú
          </span>
          <button
            onClick={backToClosed}
            className="shrink-0 font-medium text-muted underline hover:text-fg"
          >
            volver
          </button>
        </div>
      )}

      <header className="border-b border-line bg-surface px-6 py-4">
        <h1 className="text-xl font-bold text-accent">Rowlys</h1>

        {!readOnly && (
          <div className="mt-3 flex gap-1">
            {(Object.keys(ORDER_TYPE_LABELS) as OrderType[]).map((type) => {
              const enabled = channelEnabled(storeInfo, type);
              return (
                <button
                  key={type}
                  onClick={() => setOrderType(type)}
                  disabled={!enabled}
                  className={
                    "rounded-lg px-3 py-2 text-sm font-medium transition disabled:opacity-40 " +
                    (orderType === type
                      ? "bg-store-600 text-white"
                      : "border border-line text-muted")
                  }
                >
                  {ORDER_TYPE_LABELS[type]}
                  {!enabled ? " (pausado)" : ""}
                </button>
              );
            })}
          </div>
        )}
      </header>

      {error && <p className="px-6 py-4 text-sm text-red-500">{error}</p>}

      {categories === null ? (
        <p className="px-6 py-8 text-muted">Cargando...</p>
      ) : (
        <>
          <nav className="flex gap-1 overflow-x-auto border-b border-line bg-surface px-6 py-3">
            {categories.map((category) => (
              <button
                key={category.id}
                onClick={() => setActiveCategoryId(category.id)}
                className={
                  "whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium " +
                  (activeCategoryId === category.id
                    ? "bg-store-500/15 text-accent"
                    : "text-muted hover:bg-surface-2")
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
                readOnly={readOnly}
                onOpen={() => setDetailProduct(product)}
              />
            ))}
          </div>
        </>
      )}

      {!readOnly && lines.length > 0 && (
        <button
          onClick={() => setCartOpen(true)}
          className="fixed inset-x-6 bottom-6 rounded-xl bg-store-600 px-4 py-4 text-center font-semibold text-white shadow-lg transition hover:bg-store-500"
        >
          Ver mi carrito ({formatCurrency(subtotal)})
        </button>
      )}

      {detailProduct && (
        <ProductDetailOverlay
          product={detailProduct}
          readOnly={readOnly}
          onClose={() => setDetailProduct(null)}
        />
      )}

      {!readOnly && cartOpen && (
        <CartSheet
          orderBlocked={channelPaused}
          orderBlockedReason={orderBlockedReason}
          onClose={() => setCartOpen(false)}
          onCheckout={() => router.push("/checkout")}
        />
      )}
    </div>
  );
}

function ProductCard({
  product,
  readOnly,
  onOpen,
}: {
  product: ProductDTO;
  readOnly: boolean;
  onOpen: () => void;
}) {
  const addLine = useCartStore((s) => s.addLine);
  const activeGroups = product.modifierGroups.filter((g) => g.active);

  return (
    <div
      onClick={onOpen}
      className="cursor-pointer rounded-2xl border border-line bg-surface p-4 shadow-sm transition hover:border-store-500/40 hover:shadow-md"
    >
      {product.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={product.imageUrl}
          alt={product.name}
          className="mb-3 h-32 w-full rounded-lg object-cover"
        />
      )}
      <p className="font-medium text-fg">{product.name}</p>
      {product.description && (
        <p className="mt-1 line-clamp-2 text-sm text-muted">
          {product.description}
        </p>
      )}
      <div className="mt-2 flex items-center justify-between">
        <p className="text-sm">
          {product.discountPrice != null ? (
            <>
              <span className="mr-2 text-muted line-through">
                {formatCurrency(product.price)}
              </span>
              <span className="font-semibold text-accent">
                {formatCurrency(product.discountPrice)}
              </span>
            </>
          ) : (
            <span className="font-semibold text-fg">
              {formatCurrency(product.price)}
            </span>
          )}
        </p>
        {!readOnly && activeGroups.length === 0 && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              addLine({
                productId: product.id,
                name: product.name,
                price: product.discountPrice ?? product.price,
              });
            }}
            className="rounded-full bg-store-600 px-3 py-1 text-sm font-bold text-white hover:bg-store-500"
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
  readOnly,
  onClose,
}: {
  product: ProductDTO;
  readOnly: boolean;
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
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/60 sm:items-center">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-line bg-surface p-6 shadow-xl sm:rounded-2xl">
        {product.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.imageUrl}
            alt={product.name}
            className="mb-4 h-48 w-full rounded-lg object-cover"
          />
        )}
        <h2 className="text-lg font-bold text-fg">{product.name}</h2>
        {product.description && (
          <p className="mt-1 text-sm text-muted">{product.description}</p>
        )}
        <p className="mt-2 font-semibold text-accent">
          {formatCurrency(unitPrice)}
        </p>

        {readOnly && (
          <>
            <p className="mt-4 rounded-lg bg-store-500/10 px-3 py-2 text-sm text-muted">
              El local está cerrado. Podés mirar el menú pero no hacer pedidos.
            </p>
            <button
              onClick={onClose}
              className="mt-4 w-full text-center text-sm font-medium text-muted hover:underline"
            >
              Cerrar
            </button>
          </>
        )}

        {!readOnly && activeGroups.map((group) => (
          <div key={group.id} className="mt-5">
            <p className="mb-2 text-sm font-medium text-fg">
              {group.name}{" "}
              <span className="text-muted">
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
                          ? "border-store-500 bg-store-500/15 text-accent"
                          : "border-line text-fg")
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

        {!readOnly && (
        <div className="mt-5 flex flex-col gap-1">
          <label className="text-sm font-medium text-fg">
            ¿Querés aclarar algo? (opcional)
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value.slice(0, 150))}
            rows={2}
            className="rounded-lg border border-line bg-surface-2 px-4 py-2 focus:border-store-500 focus:outline-none"
          />
        </div>
        )}

        {!readOnly && (
        <div className="mt-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              className="h-9 w-9 rounded-full border border-line font-bold text-fg"
            >
              −
            </button>
            <span className="w-6 text-center font-medium text-fg">{quantity}</span>
            <button
              onClick={() => setQuantity((q) => q + 1)}
              className="h-9 w-9 rounded-full border border-line font-bold text-fg"
            >
              +
            </button>
          </div>
          <button
            onClick={handleAdd}
            disabled={!canAdd}
            className="rounded-lg bg-store-600 px-5 py-3 font-semibold text-white transition hover:bg-store-500 disabled:opacity-40"
          >
            Agregar ({formatCurrency((unitPrice + optionsPrice) * quantity)})
          </button>
        </div>
        )}

        {!readOnly && (
        <button
          onClick={onClose}
          className="mt-4 w-full text-center text-sm font-medium text-muted hover:underline"
        >
          Cancelar
        </button>
        )}
      </div>
    </div>
  );
}

function CartSheet({
  orderBlocked,
  orderBlockedReason,
  onClose,
  onCheckout,
}: {
  orderBlocked: boolean;
  orderBlockedReason: string;
  onClose: () => void;
  onCheckout: () => void;
}) {
  const lines = useCartStore((s) => s.lines);
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const removeLine = useCartStore((s) => s.removeLine);
  const subtotal = cartSubtotal(lines);

  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/60 sm:items-center">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-line bg-surface p-6 shadow-xl sm:rounded-2xl">
        <h2 className="mb-4 text-lg font-bold text-fg">Tu carrito</h2>

        {lines.length === 0 ? (
          <p className="text-muted">Tu carrito está vacío.</p>
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
                  className="flex items-start justify-between gap-3 border-b border-line pb-3"
                >
                  <div>
                    <p className="font-medium text-fg">{line.name}</p>
                    {line.options && line.options.length > 0 && (
                      <p className="text-sm text-muted">
                        {line.options.map((o) => o.name).join(", ")}
                      </p>
                    )}
                    {line.notes && (
                      <p className="text-sm italic text-muted">
                        {line.notes}
                      </p>
                    )}
                    <p className="text-sm text-muted">
                      {formatCurrency(line.price + optionsPrice)} c/u
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => updateQuantity(key, line.quantity - 1)}
                        className="h-7 w-7 rounded-full border border-line font-bold text-fg"
                      >
                        −
                      </button>
                      <span className="w-5 text-center text-fg">{line.quantity}</span>
                      <button
                        onClick={() => updateQuantity(key, line.quantity + 1)}
                        className="h-7 w-7 rounded-full border border-line font-bold text-fg"
                      >
                        +
                      </button>
                    </div>
                    <button
                      onClick={() => removeLine(key)}
                      className="text-xs font-medium text-red-500 hover:underline"
                    >
                      Quitar
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <div className="mt-4 flex items-center justify-between font-semibold text-fg">
          <span>Subtotal</span>
          <span>{formatCurrency(subtotal)}</span>
        </div>

        {orderBlocked && (
          <p className="mt-3 rounded-lg bg-store-500/10 px-3 py-2 text-sm text-accent">
            {orderBlockedReason}. No se pueden tomar pedidos ahora.
          </p>
        )}

        <button
          onClick={onCheckout}
          disabled={lines.length === 0 || orderBlocked}
          className="mt-4 w-full rounded-lg bg-store-600 px-4 py-3 font-semibold text-white transition hover:bg-store-500 disabled:opacity-40"
        >
          Continuar al pago
        </button>
        <button
          onClick={onClose}
          className="mt-2 w-full text-center text-sm font-medium text-muted hover:underline"
        >
          Seguir viendo el menú
        </button>
      </div>
    </div>
  );
}
