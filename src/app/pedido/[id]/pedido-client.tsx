"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api-client";
import {
  formatCurrency,
  ORDER_STATUS_FLOW,
  ORDER_STATUS_LABELS,
  ORDER_TYPE_LABELS,
  PAYMENT_PROVIDER_LABELS,
  type OrderDTO,
} from "@/types";

export default function PedidoClient({ id }: { id: string }) {
  const [order, setOrder] = useState<OrderDTO | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  async function payWithMp() {
    setPaying(true);
    setPayError(null);
    try {
      const { initPoint } = await apiFetch<{ initPoint: string }>(
        "/api/payments/mercadopago",
        { method: "POST", body: JSON.stringify({ orderId: id }) }
      );
      window.location.href = initPoint;
    } catch (err) {
      setPayError((err as ApiError).message);
      setPaying(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    function load() {
      apiFetch<OrderDTO>(`/api/orders/${id}`)
        .then((data) => {
          if (!cancelled) setOrder(data);
        })
        .catch((err: ApiError) => {
          if (!cancelled && err.message.toLowerCase().includes("no encontrado")) {
            setNotFound(true);
          }
        });
    }

    load();
    intervalRef.current = setInterval(load, 5000);
    return () => {
      cancelled = true;
      clearInterval(intervalRef.current);
    };
  }, [id]);

  if (notFound) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
        <p className="text-neutral-500">No encontramos ese pedido.</p>
      </main>
    );
  }

  if (!order) {
    return (
      <main className="mx-auto max-w-md px-6 py-12">
        <p className="text-neutral-500">Cargando...</p>
      </main>
    );
  }

  const currentIndex = ORDER_STATUS_FLOW.indexOf(order.status);

  return (
    <main className="mx-auto max-w-md px-6 py-10">
      <h1 className="mb-1 text-2xl font-bold text-brand-600">Tu pedido</h1>
      <p className="mb-6 text-sm text-neutral-500">
        {ORDER_TYPE_LABELS[order.orderType]}
        {order.deliveryAddress && ` · ${order.deliveryAddress}`}
      </p>

      {order.status === "CANCELLED" ? (
        <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-red-700">
          Este pedido fue cancelado.
        </div>
      ) : (
        <div className="mb-6 flex items-center justify-between">
          {ORDER_STATUS_FLOW.map((status, i) => (
            <div key={status} className="flex flex-1 flex-col items-center">
              <div
                className={
                  "h-3 w-3 rounded-full " +
                  (i <= currentIndex ? "bg-brand-600" : "bg-neutral-200")
                }
              />
              <p
                className={
                  "mt-1 text-center text-xs " +
                  (i <= currentIndex
                    ? "font-medium text-brand-600"
                    : "text-neutral-400")
                }
              >
                {ORDER_STATUS_LABELS[status]}
              </p>
            </div>
          ))}
        </div>
      )}

      <section className="mb-4 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <h2 className="mb-3 font-semibold text-neutral-900">Ítems</h2>
        <ul className="flex flex-col gap-1 text-sm text-neutral-600">
          {order.items.map((item) => (
            <li key={item.id}>
              {item.quantity}× {item.productName}
              {item.options.length > 0 &&
                ` (${item.options.map((o) => o.name).join(", ")})`}
            </li>
          ))}
        </ul>
        <div className="mt-3 flex justify-between border-t border-neutral-200 pt-3 font-semibold text-neutral-900">
          <span>Total</span>
          <span>{formatCurrency(order.total)}</span>
        </div>
      </section>

      {order.payment && (
        <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
          <h2 className="mb-1 font-semibold text-neutral-900">Pago</h2>
          <p className="text-sm text-neutral-600">
            {PAYMENT_PROVIDER_LABELS[order.payment.provider]} ·{" "}
            {order.payment.status === "CONFIRMED" ? "Pagado" : "Pendiente"}
          </p>
          {order.payment.provider === "MP" &&
            order.payment.status !== "CONFIRMED" &&
            order.status !== "CANCELLED" && (
              <>
                <button
                  onClick={payWithMp}
                  disabled={paying}
                  className="mt-3 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
                >
                  {paying ? "Redirigiendo..." : "Pagar con Mercado Pago"}
                </button>
                {payError && (
                  <p className="mt-2 text-sm text-red-600">{payError}</p>
                )}
              </>
            )}
        </section>
      )}
    </main>
  );
}
