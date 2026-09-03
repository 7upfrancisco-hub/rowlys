"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api-client";
import ThemeToggle from "@/components/ThemeToggle";
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
  const [prepTimes, setPrepTimes] = useState({ delivery: 10, pickup: 10 });
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

    apiFetch<{
      prepTimeDeliveryMinutes?: number;
      prepTimePickupMinutes?: number;
    }>("/api/settings")
      .then((s) => {
        if (cancelled) return;
        setPrepTimes({
          delivery: s.prepTimeDeliveryMinutes ?? 10,
          pickup: s.prepTimePickupMinutes ?? 10,
        });
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      clearInterval(intervalRef.current);
    };
  }, [id]);

  if (notFound) {
    return (
      <div className="storefront">
      <ThemeToggle />
        <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
          <p className="text-muted">No encontramos ese pedido.</p>
        </main>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="storefront">
      <ThemeToggle />
        <main className="mx-auto max-w-md px-6 py-12">
          <p className="text-muted">Cargando...</p>
        </main>
      </div>
    );
  }

  const currentIndex = ORDER_STATUS_FLOW.indexOf(order.status);
  const showEta =
    order.status === "PENDING" ||
    order.status === "CONFIRMED" ||
    order.status === "IN_PROGRESS";
  const etaMinutes =
    (order.orderType === "DELIVERY" ? prepTimes.delivery : prepTimes.pickup) +
    order.extraDelayMinutes;
  // Hora aproximada de entrega/retiro: cuando entró el pedido + preparación +
  // demora extra. Se muestra en horario de Argentina.
  const etaClock = new Date(
    new Date(order.createdAt).getTime() + etaMinutes * 60000
  ).toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "America/Argentina/Buenos_Aires",
  });

  return (
    <div className="storefront">
      <ThemeToggle />
      <main className="mx-auto max-w-md px-6 py-10">
        <h1 className="mb-1 text-2xl font-bold text-accent">
          Tu pedido <span className="text-muted">#{order.number}</span>
        </h1>
        <p className="mb-4 text-sm text-muted">
          {ORDER_TYPE_LABELS[order.orderType]}
          {order.deliveryAddress && ` · ${order.deliveryAddress}`}
        </p>

        {showEta && (
          <p className="mb-6 rounded-xl border border-line bg-surface px-4 py-3 text-sm text-fg">
            ⏱️ {order.orderType === "DELIVERY" ? "Entrega estimada" : "Listo estimado"}{" "}
            <span className="font-semibold">{etaClock} hs</span>
            {order.extraDelayMinutes > 0 && (
              <span className="text-muted">
                {" "}
                (incluye +{order.extraDelayMinutes} min de demora)
              </span>
            )}
          </p>
        )}

        {order.status === "CANCELLED" ? (
          <div className="mb-6 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-red-500">
            Este pedido fue cancelado.
          </div>
        ) : (
          <div className="mb-6 flex items-center justify-between">
            {ORDER_STATUS_FLOW.map((status, i) => (
              <div key={status} className="flex flex-1 flex-col items-center">
                <div
                  className={
                    "h-3 w-3 rounded-full " +
                    (i <= currentIndex ? "bg-store-500" : "bg-line")
                  }
                />
                <p
                  className={
                    "mt-1 text-center text-xs " +
                    (i <= currentIndex
                      ? "font-medium text-accent"
                      : "text-muted")
                  }
                >
                  {ORDER_STATUS_LABELS[status]}
                </p>
              </div>
            ))}
          </div>
        )}

        <section className="mb-4 rounded-2xl border border-line bg-surface p-6 shadow-sm">
          <h2 className="mb-3 font-semibold text-fg">Ítems</h2>
          <ul className="flex flex-col gap-1 text-sm text-muted">
            {order.items.map((item) => (
              <li key={item.id}>
                {item.quantity}× {item.productName}
                {item.options.length > 0 &&
                  ` (${item.options.map((o) => o.name).join(", ")})`}
              </li>
            ))}
          </ul>
          <div className="mt-3 flex justify-between border-t border-line pt-3 font-semibold text-fg">
            <span>Total</span>
            <span>{formatCurrency(order.total)}</span>
          </div>
        </section>

        {order.payment && (
          <section className="rounded-2xl border border-line bg-surface p-6 shadow-sm">
            <h2 className="mb-1 font-semibold text-fg">Pago</h2>
            <p className="text-sm text-muted">
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
                    className="mt-3 rounded-lg bg-store-600 px-4 py-2 text-sm font-semibold text-white hover:bg-store-500 disabled:opacity-60"
                  >
                    {paying ? "Redirigiendo..." : "Pagar con Mercado Pago"}
                  </button>
                  {payError && (
                    <p className="mt-2 text-sm text-red-500">{payError}</p>
                  )}
                </>
              )}
          </section>
        )}
      </main>
    </div>
  );
}
