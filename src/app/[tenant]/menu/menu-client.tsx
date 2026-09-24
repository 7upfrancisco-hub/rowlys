"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api-client";
import { isValidHex, suggestOnAccent } from "@/lib/theme-color";
import ThemeToggle from "@/components/ThemeToggle";
import InstallPwa from "@/components/InstallPwa";
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
  coverImageUrl: string | null;
  storePhone: string | null;
  storeAddress: string | null;
  instagramHandle: string | null;
  tiktokHandle: string | null;
  footerImageLeftUrl: string | null;
  footerImageRightUrl: string | null;
  footerColor: string | null;
}

// Acepta que el local cargue el @handle, el nombre solo, o la URL completa.
function socialUrl(base: string, handle: string): string {
  const clean = handle.trim().replace(/^@/, "");
  if (/^https?:\/\//i.test(clean)) return clean;
  return base + clean;
}

// Para mostrar en pantalla: si cargaron una URL completa, se ve el @handle
// igual (no la URL entera).
function socialHandle(handle: string): string {
  const clean = handle.trim().replace(/^@/, "");
  if (/^https?:\/\//i.test(clean)) {
    return "@" + clean.replace(/^https?:\/\/(www\.)?[^/]+\//, "").replace(/\/$/, "");
  }
  return "@" + clean;
}

function channelEnabled(info: StoreInfo | null, type: OrderType): boolean {
  if (!info) return true;
  return type === "DELIVERY" ? info.deliveryEnabled : info.pickupEnabled;
}

export default function MenuClient({ tenantSlug }: { tenantSlug: string }) {
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

  // Por tenant: dos locales vistos en el mismo navegador no comparten el
  // "ya vi que está cerrado, dejame ver igual" del uno con el del otro.
  const bypassKey = `blend-store-bypass-${tenantSlug}`;

  // Secciones de categoría montadas, para el scrollspy del nav sticky y para
  // hacer scroll al tocar un tab.
  const sectionRefs = useRef<Map<string, HTMLElement>>(new Map());
  const registerSectionRef = useCallback((id: string, el: HTMLElement | null) => {
    if (el) sectionRefs.current.set(id, el);
    else sectionRefs.current.delete(id);
  }, []);
  // Mientras dura el scroll animado de un click en el nav, el scrollspy no
  // debe pisar la categoría recién elegida con la que va cruzando de paso.
  const suppressSpyUntil = useRef(0);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(bypassKey) === "1") setViewMenuAnyway(true);
    } catch {
      /* storage bloqueado: se muestra el cartel siempre */
    }
    apiFetch<CategoryDTO[]>(`/api/${tenantSlug}/menu`)
      .then((data) => {
        setCategories(data);
        if (data.length > 0) setActiveCategoryId(data[0].id);
      })
      .catch((err: ApiError) => setError(err.message));
    apiFetch<StoreInfo>(`/api/${tenantSlug}/settings`)
      .then((s) => setStoreInfo(s))
      .catch(() => {});
  }, [tenantSlug, bypassKey]);

  // Scrollspy: a medida que se scrollea, marca en el nav la categoría cuya
  // sección está pasando por la franja de arriba de la pantalla (debajo del
  // nav sticky).
  useEffect(() => {
    if (!categories || categories.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (Date.now() < suppressSpyUntil.current) return;
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length === 0) return;
        const id = visible[0].target.id.replace("category-", "");
        setActiveCategoryId(id);
      },
      { rootMargin: "-120px 0px -70% 0px", threshold: 0 }
    );
    sectionRefs.current.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [categories]);

  function scrollToCategory(id: string) {
    setActiveCategoryId(id);
    suppressSpyUntil.current = Date.now() + 700;
    sectionRefs.current.get(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function viewMenu() {
    try {
      sessionStorage.setItem(bypassKey, "1");
    } catch {
      /* ignore */
    }
    setViewMenuAnyway(true);
  }
  function backToClosed() {
    try {
      sessionStorage.removeItem(bypassKey);
    } catch {
      /* ignore */
    }
    setViewMenuAnyway(false);
  }

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
        <InstallPwa />
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
              {storeInfo?.storeName ?? ""}
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
      <InstallPwa />

      {readOnly && (
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-line bg-accent/10 px-6 py-2 text-sm">
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

      {storeInfo?.coverImageUrl ? (
        <header className="relative h-48 overflow-hidden border-b border-line sm:h-64">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={storeInfo.coverImageUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
          <div className="relative flex h-full flex-col justify-end px-6 py-4">
            <h1 className="text-xl font-bold text-white drop-shadow-sm sm:text-2xl">
              {storeInfo?.storeName || ""}
            </h1>
            {!readOnly && (
              <ChannelToggle
                storeInfo={storeInfo}
                orderType={orderType}
                setOrderType={setOrderType}
                overlay
              />
            )}
          </div>
        </header>
      ) : (
        <header className="border-b border-line bg-surface px-6 py-4">
          <h1 className="text-xl font-bold text-accent">
            {storeInfo?.storeName || ""}
          </h1>
          {!readOnly && (
            <ChannelToggle
              storeInfo={storeInfo}
              orderType={orderType}
              setOrderType={setOrderType}
            />
          )}
        </header>
      )}

      {error && <p className="px-6 py-4 text-sm text-red-500">{error}</p>}

      {categories === null ? (
        <p className="px-6 py-8 text-muted">Cargando...</p>
      ) : (
        <>
          <nav
            className={
              "sticky z-10 flex gap-1 overflow-x-auto border-b border-line bg-surface px-6 py-3 " +
              (readOnly ? "top-10" : "top-0")
            }
          >
            {categories.map((category) => (
              <button
                key={category.id}
                onClick={() => scrollToCategory(category.id)}
                className={
                  "whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors " +
                  (activeCategoryId === category.id
                    ? "bg-accent/15 text-accent"
                    : "text-muted hover:bg-surface-2")
                }
              >
                {category.name}
              </button>
            ))}
          </nav>

          {categories.map((category) => (
            <CategorySection
              key={category.id}
              category={category}
              readOnly={readOnly}
              registerRef={registerSectionRef}
              onOpenProduct={setDetailProduct}
            />
          ))}
        </>
      )}

      <StoreFooter storeInfo={storeInfo} />

      {!readOnly && lines.length > 0 && (
        <button
          onClick={() => setCartOpen(true)}
          className="fixed inset-x-6 bottom-6 rounded-xl bg-accent-solid px-4 py-4 text-center font-semibold text-on-accent shadow-lg transition hover:bg-accent-solid-hover"
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
          onCheckout={() => router.push(`/${tenantSlug}/checkout`)}
        />
      )}
    </div>
  );
}

function StoreFooter({ storeInfo }: { storeInfo: StoreInfo | null }) {
  const linkClass = "flex items-center gap-1.5 text-sm opacity-85 transition hover:opacity-100";

  // Color propio del pie de página (opcional): si no se eligió ninguno, usa
  // el mismo color de marca que el resto de la carta (bg-accent-solid /
  // text-on-accent, ya calculados en CSS vars). Si se eligió uno, el
  // contraste del texto se recalcula para ESE color puntual.
  const customColor = isValidHex(storeInfo?.footerColor) ? storeInfo!.footerColor : null;
  const customFg = customColor
    ? suggestOnAccent(customColor) === "white"
      ? "#ffffff"
      : "#171717"
    : undefined;

  return (
    <footer
      className={
        "relative flex flex-col items-center gap-4 px-6 pb-8 pt-10 sm:block " +
        (customColor ? "" : "bg-accent-solid text-on-accent")
      }
      style={customColor ? { backgroundColor: customColor, color: customFg } : undefined}
    >
      {/* En celular las imágenes van apiladas arriba/abajo del texto (orden
          normal del flex). Desde `sm:` se anclan a los costados, superpuestas
          sobre todo el alto del pie de página. */}
      {storeInfo?.footerImageLeftUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={storeInfo.footerImageLeftUrl}
          alt=""
          className="pointer-events-none order-1 h-20 w-auto object-contain sm:absolute sm:left-6 sm:top-1/2 sm:order-none sm:h-44 sm:-translate-y-1/2"
        />
      )}
      {storeInfo?.footerImageRightUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={storeInfo.footerImageRightUrl}
          alt=""
          className="pointer-events-none order-3 h-20 w-auto object-contain sm:absolute sm:right-6 sm:top-1/2 sm:order-none sm:h-44 sm:-translate-y-1/2"
        />
      )}
      <div className="relative order-2 mx-auto flex max-w-3xl flex-col items-center gap-3 text-center sm:order-none">
        <p className="text-lg font-bold">{storeInfo?.storeName ?? ""}</p>
        <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
          {storeInfo?.storeAddress && (
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(storeInfo.storeAddress)}`}
              target="_blank"
              rel="noopener noreferrer"
              className={linkClass}
            >
              <PinIcon className="h-3.5 w-3.5 shrink-0" />
              {storeInfo.storeAddress}
            </a>
          )}
          {storeInfo?.storePhone && (
            <a href={`tel:${storeInfo.storePhone}`} className={linkClass}>
              <PhoneIcon className="h-3.5 w-3.5 shrink-0" />
              {storeInfo.storePhone}
            </a>
          )}
          {storeInfo?.instagramHandle && (
            <a
              href={socialUrl("https://instagram.com/", storeInfo.instagramHandle)}
              target="_blank"
              rel="noopener noreferrer"
              className={linkClass}
            >
              <InstagramIcon className="h-3.5 w-3.5 shrink-0" />
              {socialHandle(storeInfo.instagramHandle)}
            </a>
          )}
          {storeInfo?.tiktokHandle && (
            <a
              href={socialUrl("https://tiktok.com/@", storeInfo.tiktokHandle)}
              target="_blank"
              rel="noopener noreferrer"
              className={linkClass}
            >
              <TiktokIcon className="h-3.5 w-3.5 shrink-0" />
              {socialHandle(storeInfo.tiktokHandle)}
            </a>
          )}
        </div>
      </div>
    </footer>
  );
}

function PinIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5Z" />
    </svg>
  );
}

function PhoneIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C11 21 3 13 3 4c0-.6.4-1 1-1h3.4c.6 0 1 .4 1 1 0 1.2.2 2.4.6 3.6.1.4 0 .8-.2 1L6.6 10.8Z" />
    </svg>
  );
}

function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function TiktokIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M16.5 2h-3v13.5a3 3 0 1 1-2.5-2.96V9.4a6 6 0 1 0 5.5 5.98V9.1a7.5 7.5 0 0 0 4.5 1.5V7.6c-2.3 0-4.2-1.7-4.5-3.9V2Z" />
    </svg>
  );
}

function ChannelToggle({
  storeInfo,
  orderType,
  setOrderType,
  overlay = false,
}: {
  storeInfo: StoreInfo | null;
  orderType: OrderType;
  setOrderType: (type: OrderType) => void;
  overlay?: boolean;
}) {
  return (
    <div className="mt-3 flex gap-1">
      {(Object.keys(ORDER_TYPE_LABELS) as OrderType[]).map((type) => {
        const enabled = channelEnabled(storeInfo, type);
        const active = orderType === type;
        return (
          <button
            key={type}
            onClick={() => setOrderType(type)}
            disabled={!enabled}
            className={
              "rounded-lg px-3 py-2 text-sm font-medium transition disabled:opacity-40 " +
              (active
                ? "bg-accent-solid text-on-accent"
                : overlay
                  ? "border border-white/50 bg-black/20 text-white backdrop-blur-sm"
                  : "border border-line text-muted")
            }
          >
            {ORDER_TYPE_LABELS[type]}
            {!enabled ? " (pausado)" : ""}
          </button>
        );
      })}
    </div>
  );
}

// Revela una sola vez (no vuelve a ocultarse si se scrollea para atrás) el
// elemento apenas entra en el viewport, para el efecto "van apareciendo" de
// las secciones de categoría.
function useRevealOnScroll<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1, rootMargin: "0px 0px -10% 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return { ref, visible };
}

function CategorySection({
  category,
  readOnly,
  registerRef,
  onOpenProduct,
}: {
  category: CategoryDTO;
  readOnly: boolean;
  registerRef: (id: string, el: HTMLElement | null) => void;
  onOpenProduct: (product: ProductDTO) => void;
}) {
  const { ref, visible } = useRevealOnScroll<HTMLElement>();

  return (
    <section
      id={`category-${category.id}`}
      ref={(el) => {
        ref.current = el;
        registerRef(category.id, el);
      }}
      className="scroll-mt-28 px-6 py-6"
    >
      <h2 className="mb-4 text-lg font-bold text-fg">{category.name}</h2>
      <div
        className={
          "grid grid-cols-1 gap-4 transition-all duration-700 ease-out sm:grid-cols-2 lg:grid-cols-3 " +
          (visible ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0")
        }
      >
        {category.products.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            readOnly={readOnly}
            onOpen={() => onOpenProduct(product)}
          />
        ))}
      </div>
    </section>
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
      className="cursor-pointer rounded-2xl border border-line bg-surface p-4 shadow-sm transition hover:border-accent/40 hover:shadow-md"
    >
      {product.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={product.imageUrl}
          alt={product.name}
          className="mb-3 aspect-[4/3] w-full rounded-lg object-cover"
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
                categoryId: product.categoryId,
                name: product.name,
                price: product.discountPrice ?? product.price,
              });
            }}
            className="rounded-full bg-accent-solid px-3 py-1 text-sm font-bold text-on-accent hover:bg-accent-solid-hover"
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
      categoryId: product.categoryId,
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
            className="mb-4 aspect-[4/3] w-full rounded-lg object-cover"
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
            <p className="mt-4 rounded-lg bg-accent/10 px-3 py-2 text-sm text-muted">
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
                          ? "border-accent bg-accent/15 text-accent"
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
            className="rounded-lg border border-line bg-surface-2 px-4 py-2 focus:border-accent focus:outline-none"
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
            className="rounded-lg bg-accent-solid px-5 py-3 font-semibold text-on-accent transition hover:bg-accent-solid-hover disabled:opacity-40"
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
          <p className="mt-3 rounded-lg bg-accent/10 px-3 py-2 text-sm text-accent">
            {orderBlockedReason}. No se pueden tomar pedidos ahora.
          </p>
        )}

        <button
          onClick={onCheckout}
          disabled={lines.length === 0 || orderBlocked}
          className="mt-4 w-full rounded-lg bg-accent-solid px-4 py-3 font-semibold text-on-accent transition hover:bg-accent-solid-hover disabled:opacity-40"
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
