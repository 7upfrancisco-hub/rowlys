"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api-client";
import ThemeToggle from "@/components/ThemeToggle";
import { useCartStore, cartSubtotal } from "@/lib/cart-store";
import { formatCurrency, ORDER_TYPE_LABELS, type OrderDTO } from "@/types";

interface PublicSettings {
  storeName: string;
  storePhone: string | null;
  storeAddress: string | null;
  deliveryFee: number;
  bankAlias: string | null;
  mpEnabled: boolean;
}

type PaymentMethod = "CASH" | "BANK_TRANSFER" | "MP";

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: "Efectivo",
  BANK_TRANSFER: "Transferencia",
  MP: "Mercado Pago",
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

export default function CheckoutClient() {
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
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [changeFor, setChangeFor] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    apiFetch<PublicSettings>("/api/settings").then(setSettings).catch(() => {});
  }, []);

  const itemsSubtotal = cartSubtotal(lines);
  const deliveryFee = orderType === "DELIVERY" ? settings?.deliveryFee ?? 0 : 0;
  const total = itemsSubtotal + deliveryFee;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!firstName.trim() || !lastName.trim() || !phone.trim()) {
      setError("Faltan completar nombre, apellido o teléfono.");
      return;
    }
    if (orderType === "DELIVERY" && !address.trim()) {
      setError("Falta la dirección de envío.");
      return;
    }

    setSubmitting(true);
    try {
      const order = await apiFetch<OrderDTO>("/api/orders", {
        method: "POST",
        body: JSON.stringify({
          orderType,
          customerFirstName: firstName.trim(),
          customerLastName: lastName.trim(),
          customerPhone: `${dialCode} ${phone.trim()}`,
          customerEmail: email.trim() || undefined,
          deliveryAddress: orderType === "DELIVERY" ? address.trim() : undefined,
          notes: notes.trim() || undefined,
          paymentMethod,
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
      if (paymentMethod === "MP") {
        // El pedido ya existe (pendiente). Pedimos el link de pago y mandamos
        // al cliente a Mercado Pago; si abandona, puede reintentar desde
        // /pedido/[id]. El webhook confirma el pago despues.
        const { initPoint } = await apiFetch<{ initPoint: string }>(
          "/api/payments/mercadopago",
          { method: "POST", body: JSON.stringify({ orderId: order.id }) }
        );
        clear();
        window.location.href = initPoint;
        return;
      }

      clear();
      router.push(`/pedido/${order.id}`);
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
            href="/menu"
            className="rounded-lg bg-store-600 px-4 py-3 font-semibold text-white hover:bg-store-500"
          >
            Ver el menú
          </Link>
        </main>
      </div>
    );
  }

  const pillClass = (active: boolean) =>
    "rounded-lg px-4 py-2 text-sm font-medium " +
    (active ? "bg-store-600 text-white" : "border border-line text-muted");

  const inputClass =
    "rounded-lg border border-line bg-surface-2 px-4 py-2 focus:border-store-500 focus:outline-none";

  return (
    <div className="storefront">
      <ThemeToggle />
      <main className="mx-auto max-w-lg px-6 py-10">
        <h1 className="mb-2 text-2xl font-bold text-accent">
          Finalizar compra
        </h1>
        <p className="mb-6 text-sm text-muted">
          Tenemos un tiempo de demora estimado de 10 minutos.
          {orderType === "PICKUP" && settings?.storeAddress && (
            <> Retirá tu pedido en {settings.storeName}, {settings.storeAddress}.</>
          )}
        </p>

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
              <input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Dirección de envío*"
                className={inputClass}
              />
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
                onClick={() => setPaymentMethod("BANK_TRANSFER")}
                className={pillClass(paymentMethod === "BANK_TRANSFER")}
              >
                Transferencia
              </button>
              {settings?.mpEnabled && (
                <button
                  type="button"
                  onClick={() => setPaymentMethod("MP")}
                  className={pillClass(paymentMethod === "MP")}
                >
                  Mercado Pago
                </button>
              )}
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
            {paymentMethod === "BANK_TRANSFER" && (
              <div className="rounded-lg bg-surface-2 p-3 text-sm text-fg">
                Transferí a este alias/CBU y aclaralo con tu nombre:
                <p className="mt-1 font-mono font-semibold text-accent">
                  {settings?.bankAlias ?? "Consultá el alias al confirmar"}
                </p>
              </div>
            )}
            {paymentMethod === "MP" && (
              <p className="rounded-lg bg-surface-2 p-3 text-sm text-fg">
                Al confirmar te llevamos a Mercado Pago para pagar con tu
                billetera, tarjeta o transferencia. El pedido queda registrado
                apenas confirmás.
              </p>
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
            {orderType === "DELIVERY" && (
              <div className="flex justify-between text-sm text-muted">
                <span>Envío</span>
                <span>{formatCurrency(deliveryFee)}</span>
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
            disabled={submitting}
            className="rounded-lg bg-store-600 px-4 py-4 font-semibold text-white transition hover:bg-store-500 disabled:opacity-60"
          >
            {submitting
              ? paymentMethod === "MP"
                ? "Redirigiendo a Mercado Pago..."
                : "Enviando..."
              : `Pagar ${formatCurrency(total)} (${PAYMENT_METHOD_LABELS[paymentMethod]})`}
          </button>
        </form>
      </main>
    </div>
  );
}
