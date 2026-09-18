"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api-client";
import ThemeToggle from "@/components/ThemeToggle";
import AddressAutocomplete, {
  type AddressSelection,
} from "@/components/AddressAutocomplete";
import { useCartStore, cartSubtotal } from "@/lib/cart-store";
import { formatCurrency, ORDER_TYPE_LABELS, type OrderDTO } from "@/types";
import {
  priceAutomaticDiscounts,
  type DiscountRule,
  type PricingLine,
} from "@/lib/discount-pricing";

interface PublicSettings {
  storeName: string;
  storePhone: string | null;
  storeAddress: string | null;
  deliveryFee: number;
  bankAlias: string | null;
  mpEnabled: boolean;
  storeOpen: boolean;
  deliveryEnabled: boolean;
  pickupEnabled: boolean;
  closedTitle: string | null;
  prepTimeDeliveryMinutes: number;
  prepTimePickupMinutes: number;
}

// Lo que elige el cliente. "TRANSFER" se resuelve al confirmar: si el local
// tiene Mercado Pago activo, va por MP (redirección + confirmación automática por
// webhook); si no, cae a transferencia bancaria manual (alias/CBU).
type PaymentMethod = "CASH" | "TRANSFER";

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: "Efectivo",
  TRANSFER: "Transferencia",
};

// Código de país para el teléfono. Argentina por defecto; el resto cubre los
// países desde donde razonablemente puede pedir un cliente del local.
const DIAL_CODES = [
  { code: "+54", label: "🇦🇷 +54" },
  { code: "+598", label: "🇺🇾 +598" },
  { code: "+55", label: "🇧🇷 +55" },
  { code: "+56", label: "🇨🇱 +56" },
  { code: "+595", label: "🇵🇾 +595" },
  { code: "+591", label: "🇧🇴 +591" },
  { code: "+51", label: "🇵🇪 +51" },
  { code: "+34", label: "🇪🇸 +34" },
  { code: "+1", label: "🇺🇸 +1" },
];

export default function CheckoutClient({ tenantSlug }: { tenantSlug: string }) {
  const router = useRouter();
  const orderType = useCartStore((s) => s.orderType);
  const lines = useCartStore((s) => s.lines);
  const clear = useCartStore((s) => s.clear);

  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [dialCode, setDialCode] = useState("+54");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  // Coordenadas de la dirección elegida en el autocompletar de Google — se
  // pierden si el cliente sigue tipeando después de elegir una sugerencia
  // (ver handleAddressChange), porque ya no representan lo que hay escrito.
  const [addressCoords, setAddressCoords] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [zonePreview, setZonePreview] = useState<{
    fee: number;
    zoneName: string | null;
  } | null>(null);
  const [zoneError, setZoneError] = useState<string | null>(null);
  const [checkingZone, setCheckingZone] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [changeFor, setChangeFor] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<{
    code: string;
    discountAmount: number;
    // Subtotal post-descuentos-automáticos contra el que se cotizó este
    // monto — si cambia (el cliente modifica el carrito, cambia de canal,
    // etc.), el monto mostrado queda desactualizado y hay que invalidarlo.
    quotedAgainst: number;
  } | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [checkingCoupon, setCheckingCoupon] = useState(false);
  const [discountRules, setDiscountRules] = useState<DiscountRule[]>([]);

  useEffect(() => {
    apiFetch<PublicSettings>(`/api/${tenantSlug}/settings`).then(setSettings).catch(() => {});
    apiFetch<DiscountRule[]>(`/api/${tenantSlug}/discounts`).then(setDiscountRules).catch(() => {});
  }, [tenantSlug]);

  const itemsSubtotal = cartSubtotal(lines);
  // Mientras no se resolvió la zona (o no hay zonas cargadas) se muestra la
  // tarifa plana de siempre; apenas el cliente elige una dirección real del
  // autocompletar, `zonePreview` la reemplaza por la tarifa de su zona.
  const baseDeliveryFee =
    orderType === "DELIVERY" ? zonePreview?.fee ?? settings?.deliveryFee ?? 0 : 0;

  function handleAddressChange(value: string) {
    setAddress(value);
    // Se perdió la selección puntual del autocompletar: hasta que no elija
    // de nuevo una sugerencia, no hay coordenadas confiables.
    setAddressCoords(null);
    setZonePreview(null);
    setZoneError(null);
  }

  function handleAddressSelect(selection: AddressSelection) {
    setAddress(selection.address);
    setAddressCoords({ lat: selection.lat, lng: selection.lng });
    setZonePreview(null);
    setZoneError(null);
    setCheckingZone(true);
    apiFetch<{ fee: number; zoneName: string | null }>(
      `/api/${tenantSlug}/delivery-zones/resolve?lat=${selection.lat}&lng=${selection.lng}`
    )
      .then((result) => setZonePreview(result))
      .catch((err: ApiError) => setZoneError(err.message))
      .finally(() => setCheckingZone(false));
  }

  // "Transferencia" va por Mercado Pago solo si el local lo tiene activo.
  const mpTransfer = paymentMethod === "TRANSFER" && !!settings?.mpEnabled;
  // Medio de pago real (el que ve el server): CASH, o MP/transferencia
  // bancaria manual según si el local tiene Mercado Pago activo.
  const provider = paymentMethod === "CASH" ? "CASH" : mpTransfer ? "MP" : "BANK_TRANSFER";

  // Descuentos automáticos (Directo/Combo/Método de pago/Envío gratis): se
  // recalculan solos con cada cambio del carrito o el medio de pago, sin que
  // el cliente haga nada — a diferencia del cupón. Es solo preview: el
  // server vuelve a calcular todo esto de cero en `createOrder`.
  const pricingLines: PricingLine[] = useMemo(
    () =>
      lines.map((line) => ({
        productId: line.productId,
        categoryId: line.categoryId ?? null,
        quantity: line.quantity,
        unitPrice: line.price,
        optionsPricePerUnit: (line.options ?? []).reduce((s, o) => s + o.price, 0),
      })),
    [lines]
  );
  const automatic = useMemo(
    () =>
      priceAutomaticDiscounts(
        pricingLines,
        orderType,
        provider,
        baseDeliveryFee,
        discountRules
      ),
    [pricingLines, orderType, provider, baseDeliveryFee, discountRules]
  );

  const couponDiscountAmount = appliedCoupon?.discountAmount ?? 0;
  const deliveryFee = automatic.deliveryFee;
  const total = Math.max(0, automatic.itemsTotal - couponDiscountAmount) + deliveryFee;

  async function handleApplyCoupon() {
    setCouponError(null);
    if (!couponCode.trim()) return;
    if (!phone.trim()) {
      setCouponError("Completá tu teléfono antes de aplicar un cupón.");
      return;
    }
    setCheckingCoupon(true);
    try {
      const result = await apiFetch<{ code: string; discountAmount: number }>(
        `/api/${tenantSlug}/coupons/validate`,
        {
          method: "POST",
          body: JSON.stringify({
            code: couponCode.trim(),
            phone: `${dialCode} ${phone.trim()}`,
            orderType,
            paymentMethod: provider,
            items: lines.map((line) => ({
              productId: line.productId,
              quantity: line.quantity,
              optionIds: line.options?.map((o) => o.optionId),
            })),
          }),
        }
      );
      setAppliedCoupon({ ...result, quotedAgainst: automatic.itemsTotal });
    } catch (err) {
      setAppliedCoupon(null);
      setCouponError((err as ApiError).message);
    } finally {
      setCheckingCoupon(false);
    }
  }

  function removeCoupon() {
    setAppliedCoupon(null);
    setCouponCode("");
    setCouponError(null);
  }

  // El monto de un cupón aplicado se cotiza contra `automatic.itemsTotal` en
  // ese momento. Si esa base cambia después (el cliente vuelve al carrito y
  // agrega/saca cosas, cambia de canal, o cambia el medio de pago y eso
  // mueve el subtotal por un descuento de PAYMENT_METHOD), el monto
  // mostrado queda desactualizado — se invalida acá para no mostrar un
  // número que no coincide con lo que se va a cobrar. Queda el código
  // cargado para que sea un click volver a aplicarlo.
  useEffect(() => {
    if (appliedCoupon && appliedCoupon.quotedAgainst !== automatic.itemsTotal) {
      setAppliedCoupon(null);
      setCouponError("El total cambió — volvé a aplicar el cupón.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [automatic.itemsTotal]);


  // Pedir queda bloqueado si el local está cerrado o el canal elegido pausado.
  const storeClosed = !!settings && !settings.storeOpen;
  const channelPaused =
    !storeClosed &&
    !!settings &&
    (orderType === "DELIVERY"
      ? !settings.deliveryEnabled
      : !settings.pickupEnabled);
  const orderBlocked = storeClosed || channelPaused;
  const orderBlockedReason = storeClosed
    ? settings?.closedTitle || "El local está cerrado en este momento"
    : orderType === "DELIVERY"
      ? "El envío a domicilio está pausado en este momento"
      : "El retiro en el local está pausado en este momento";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (orderBlocked) {
      setError(`${orderBlockedReason}. No se pueden tomar pedidos.`);
      return;
    }
    if (!firstName.trim() || !lastName.trim() || !phone.trim()) {
      setError("Faltan completar nombre, apellido o teléfono.");
      return;
    }
    if (orderType === "DELIVERY" && !address.trim()) {
      setError("Falta la dirección de envío.");
      return;
    }
    if (orderType === "DELIVERY" && zoneError) {
      setError(zoneError);
      return;
    }

    setSubmitting(true);
    try {
      const order = await apiFetch<OrderDTO>(`/api/${tenantSlug}/orders`, {
        method: "POST",
        body: JSON.stringify({
          orderType,
          customerFirstName: firstName.trim(),
          customerLastName: lastName.trim(),
          customerPhone: `${dialCode} ${phone.trim()}`,
          customerEmail: email.trim() || undefined,
          deliveryAddress: orderType === "DELIVERY" ? address.trim() : undefined,
          deliveryLat:
            orderType === "DELIVERY" ? addressCoords?.lat : undefined,
          deliveryLng:
            orderType === "DELIVERY" ? addressCoords?.lng : undefined,
          notes: notes.trim() || undefined,
          paymentMethod: provider,
          couponCode: appliedCoupon?.code,
          changeFor:
            paymentMethod === "CASH" && changeFor.trim()
              ? Number(changeFor)
              : undefined,
          items: lines.map((line) => ({
            productId: line.productId,
            quantity: line.quantity,
            notes: line.notes,
            optionIds: line.options?.map((o) => o.optionId),
          })),
        }),
      });
      if (provider === "MP") {
        // El pedido ya existe (pendiente y oculto para la cocina). Pedimos el
        // link de pago y mandamos al cliente a Mercado Pago. Si la creación del
        // link falla, lo llevamos al seguimiento para que reintente. El webhook
        // confirma el pago y recién ahí el pedido llega a la comanda.
        clear();
        try {
          const { initPoint } = await apiFetch<{ initPoint: string }>(
            "/api/payments/mercadopago",
            { method: "POST", body: JSON.stringify({ orderId: order.id }) }
          );
          window.location.href = initPoint;
        } catch {
          router.push(`/${tenantSlug}/pedido/${order.id}`);
        }
        return;
      }

      clear();
      router.push(`/${tenantSlug}/pedido/${order.id}`);
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setSubmitting(false);
    }
  }

  if (lines.length === 0) {
    return (
      <div className="storefront">
      <ThemeToggle />
        <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
          <p className="text-muted">Tu carrito está vacío.</p>
          <Link
            href={`/${tenantSlug}/menu`}
            className="rounded-lg bg-accent-solid px-4 py-3 font-semibold text-on-accent hover:bg-accent-solid-hover"
          >
            Ver el menú
          </Link>
        </main>
      </div>
    );
  }

  const pillClass = (active: boolean) =>
    "rounded-lg px-4 py-2 text-sm font-medium " +
    (active ? "bg-accent-solid text-on-accent" : "border border-line text-muted");

  const inputClass =
    "rounded-lg border border-line bg-surface-2 px-4 py-2 focus:border-accent focus:outline-none";

  return (
    <div className="storefront">
      <ThemeToggle />
      <main className="mx-auto max-w-lg px-6 py-10">
        <h1 className="mb-2 text-2xl font-bold text-accent">
          Finalizar compra
        </h1>
        <p className="mb-6 text-sm text-muted">
          Tenemos un tiempo de demora estimado de{" "}
          {(orderType === "DELIVERY"
            ? settings?.prepTimeDeliveryMinutes
            : settings?.prepTimePickupMinutes) ?? 10}{" "}
          minutos.
          {orderType === "PICKUP" && settings?.storeAddress && (
            <> Retirá tu pedido en {settings.storeName}, {settings.storeAddress}.</>
          )}
        </p>

        {orderBlocked && (
          <div className="mb-6 rounded-2xl border border-accent/30 bg-accent/10 p-4">
            <p className="font-semibold text-accent">{orderBlockedReason}</p>
            <p className="mt-1 text-sm text-muted">
              {settings?.closedTitle && storeClosed
                ? "Podés ver el menú, pero no se pueden tomar pedidos ahora."
                : "Probá con el otro canal o volvé más tarde."}
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <section className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-6 shadow-sm">
            <h2 className="font-semibold text-fg">Mis datos</h2>
            <p className="text-sm text-muted">
              Canal: {ORDER_TYPE_LABELS[orderType]}
            </p>
            <div className="grid grid-cols-2 gap-3">
              <input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Nombre*"
                className={inputClass}
              />
              <input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Apellido*"
                className={inputClass}
              />
            </div>
            <div className="flex gap-2">
              <select
                value={dialCode}
                onChange={(e) => setDialCode(e.target.value)}
                aria-label="Código de país"
                className={inputClass + " shrink-0 bg-surface-2 pr-2"}
              >
                {DIAL_CODES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label}
                  </option>
                ))}
              </select>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                inputMode="tel"
                placeholder="Teléfono*"
                className={inputClass + " flex-1"}
              />
            </div>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email (opcional)"
              className={inputClass}
            />
            {orderType === "DELIVERY" && (
              <div className="flex flex-col gap-1">
                <AddressAutocomplete
                  value={address}
                  onChange={handleAddressChange}
                  onSelect={handleAddressSelect}
                  placeholder="Dirección de envío*"
                  className={inputClass}
                />
                {checkingZone && (
                  <p className="text-xs text-muted">Calculando el envío...</p>
                )}
                {zoneError && (
                  <p className="text-xs text-accent">{zoneError}</p>
                )}
                {zonePreview?.zoneName && (
                  <p className="text-xs text-muted">
                    Zona: {zonePreview.zoneName} —{" "}
                    {formatCurrency(zonePreview.fee)} de envío
                  </p>
                )}
              </div>
            )}
          </section>

          <section className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-6 shadow-sm">
            <h2 className="font-semibold text-fg">Método de pago</h2>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPaymentMethod("CASH")}
                className={pillClass(paymentMethod === "CASH")}
              >
                Efectivo
              </button>
              <button
                type="button"
                onClick={() => setPaymentMethod("TRANSFER")}
                className={pillClass(paymentMethod === "TRANSFER")}
              >
                Transferencia
              </button>
            </div>
            {paymentMethod === "CASH" && (
              <input
                value={changeFor}
                onChange={(e) => setChangeFor(e.target.value)}
                type="number"
                placeholder="¿Con cuánto vas a pagar? (opcional)"
                className={inputClass}
              />
            )}
            {paymentMethod === "TRANSFER" && mpTransfer && (
              <p className="rounded-lg bg-surface-2 p-3 text-sm text-fg">
                Al confirmar te llevamos a Mercado Pago para pagar por
                transferencia, billetera o tarjeta. El pedido entra a la cocina
                recién cuando se acredita el pago.
              </p>
            )}
            {paymentMethod === "TRANSFER" && !mpTransfer && (
              <div className="rounded-lg bg-surface-2 p-3 text-sm text-fg">
                Transferí a este alias/CBU y aclaralo con tu nombre:
                <p className="mt-1 font-mono font-semibold text-accent">
                  {settings?.bankAlias ?? "Consultá el alias al confirmar"}
                </p>
              </div>
            )}
          </section>

          <section className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-6 shadow-sm">
            <label className="text-sm font-medium text-fg">
              ¿Quieres aclarar algo sobre tu pedido?
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value.slice(0, 150))}
              rows={2}
              className={inputClass}
            />
          </section>

          <section className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-6 shadow-sm">
            <label className="text-sm font-medium text-fg">Código de cupón</label>
            {appliedCoupon ? (
              <div className="flex items-center justify-between gap-3 rounded-lg bg-surface-2 px-3 py-2 text-sm">
                <span className="text-fg">
                  <span className="font-mono font-semibold text-accent">
                    {appliedCoupon.code}
                  </span>{" "}
                  aplicado: −{formatCurrency(appliedCoupon.discountAmount)}
                </span>
                <button
                  type="button"
                  onClick={removeCoupon}
                  className="shrink-0 font-medium text-muted underline hover:text-fg"
                >
                  Quitar
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  value={couponCode}
                  onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                  placeholder="Ej: ROWLYSXARG"
                  className={inputClass + " flex-1 font-mono uppercase"}
                />
                <button
                  type="button"
                  onClick={handleApplyCoupon}
                  disabled={checkingCoupon || !couponCode.trim()}
                  className="shrink-0 rounded-lg border border-line px-4 py-2 text-sm font-medium text-fg transition hover:bg-surface-2 disabled:opacity-60"
                >
                  {checkingCoupon ? "Verificando..." : "Aplicar"}
                </button>
              </div>
            )}
            {couponError && <p className="text-sm text-red-500">{couponError}</p>}
          </section>

          <section className="rounded-2xl border border-line bg-surface p-6 shadow-sm">
            <h2 className="mb-3 font-semibold text-fg">Resumen</h2>
            <ul className="mb-3 flex flex-col gap-1 text-sm text-muted">
              {lines.map((line, i) => (
                <li key={i}>
                  {line.quantity}× {line.name}
                  {line.options && line.options.length > 0 && (
                    <span className="text-muted">
                      {" "}
                      ({line.options.map((o) => o.name).join(", ")})
                    </span>
                  )}
                </li>
              ))}
            </ul>
            <div className="flex justify-between text-sm text-muted">
              <span>Subtotal</span>
              <span>{formatCurrency(itemsSubtotal)}</span>
            </div>
            {automatic.applications.map((app, i) => (
              <div key={i} className="flex justify-between text-sm text-accent">
                <span>{app.title}</span>
                <span>−{formatCurrency(app.amount)}</span>
              </div>
            ))}
            {appliedCoupon && (
              <div className="flex justify-between text-sm text-accent">
                <span>Cupón {appliedCoupon.code}</span>
                <span>−{formatCurrency(couponDiscountAmount)}</span>
              </div>
            )}
            {orderType === "DELIVERY" && (
              <div className="flex justify-between text-sm text-muted">
                <span>Envío</span>
                {deliveryFee < baseDeliveryFee ? (
                  <span>
                    <span className="mr-1 line-through">
                      {formatCurrency(baseDeliveryFee)}
                    </span>
                    {formatCurrency(deliveryFee)}
                  </span>
                ) : (
                  <span>{formatCurrency(deliveryFee)}</span>
                )}
              </div>
            )}
            <div className="mt-2 flex justify-between border-t border-line pt-2 font-semibold text-fg">
              <span>Total</span>
              <span>{formatCurrency(total)}</span>
            </div>
          </section>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <button
            type="submit"
            disabled={submitting || orderBlocked}
            className="rounded-lg bg-accent-solid px-4 py-4 font-semibold text-on-accent transition hover:bg-accent-solid-hover disabled:opacity-60"
          >
            {orderBlocked
              ? "Pedidos pausados"
              : submitting
                ? mpTransfer
                  ? "Redirigiendo a Mercado Pago..."
                  : "Enviando..."
                : `Pagar ${formatCurrency(total)} (${PAYMENT_METHOD_LABELS[paymentMethod]})`}
          </button>
        </form>
      </main>
    </div>
  );
}
