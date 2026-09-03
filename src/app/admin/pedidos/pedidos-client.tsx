"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api-client";
import {
  ORDER_STATUS_LABELS,
  ORDER_TYPE_LABELS,
  PAYMENT_PROVIDER_LABELS,
  formatCurrency,
  type OrderDTO,
  type OrderType,
} from "@/types";

// Este panel es solo historial: pedidos ya entregados o cancelados. La gestión
// de los pedidos en curso vive en /comanda.
type HistTab = "DELIVERED" | "CANCELLED";

export default function PedidosClient() {
  const [orders, setOrders] = useState<OrderDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<HistTab>("DELIVERED");
  const [orderTypeFilter, setOrderTypeFilter] = useState<OrderType | "ALL">(
    "ALL"
  );
  const [search, setSearch] = useState("");

  function load() {
    apiFetch<OrderDTO[]>("/api/orders?status=DELIVERED,CANCELLED")
      .then(setOrders)
      .catch((err: ApiError) => setError(err.message));
  }
  useEffect(load, []);

  async function markPaid(id: string) {
    setError(null);
    try {
      const updated = await apiFetch<OrderDTO>(`/api/admin/orders/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ markPaid: true }),
      });
      setOrders((prev) =>
        prev ? prev.map((o) => (o.id === id ? updated : o)) : prev
      );
    } catch (err) {
      setError((err as ApiError).message);
    }
  }

  const counts = useMemo(() => {
    let delivered = 0;
    let cancelled = 0;
    for (const o of orders ?? []) {
      if (o.status === "DELIVERED") delivered++;
      else if (o.status === "CANCELLED") cancelled++;
    }
    return { delivered, cancelled };
  }, [orders]);

  const filtered = useMemo(() => {
    if (!orders) return [];
    const term = search.trim().toLowerCase();
    return orders.filter((order) => {
      if (order.status !== tab) return false;
      if (orderTypeFilter !== "ALL" && order.orderType !== orderTypeFilter)
        return false;
      if (term) {
        const haystack =
          `${order.customerFirstName} ${order.customerLastName} ${order.customerPhone}`.toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });
  }, [orders, tab, orderTypeFilter, search]);

  return (
    <div>
      <h2 className="mb-1 text-2xl font-bold text-neutral-900">
        Historial de pedidos
      </h2>
      <p className="mb-6 text-sm text-neutral-500">
        Pedidos ya entregados y cancelados. Los pedidos en curso se gestionan
        desde la comanda.
      </p>

      <div className="mb-4 flex flex-wrap gap-2">
        <TabBtn active={tab === "DELIVERED"} onClick={() => setTab("DELIVERED")}>
          Finalizados ({counts.delivered})
        </TabBtn>
        <TabBtn active={tab === "CANCELLED"} onClick={() => setTab("CANCELLED")}>
          Cancelados ({counts.cancelled})
        </TabBtn>
      </div>

      <div className="mb-6 flex flex-wrap gap-3">
        <select
          value={orderTypeFilter}
          onChange={(e) =>
            setOrderTypeFilter(e.target.value as OrderType | "ALL")
          }
          className="rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
        >
          <option value="ALL">Todos los canales</option>
          {Object.entries(ORDER_TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre o teléfono"
          className="flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
        />
      </div>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {orders === null ? (
        <p className="text-neutral-500">Cargando...</p>
      ) : filtered.length === 0 ? (
        <p className="text-neutral-500">No hay pedidos que coincidan.</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {filtered.map((order) => {
            const canMarkPaid =
              order.payment &&
              order.payment.status !== "CONFIRMED" &&
              (order.payment.provider === "CASH" ||
                order.payment.provider === "BANK_TRANSFER");

            return (
              <li
                key={order.id}
                className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm"
              >
                <div className="mb-3 flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="font-medium text-neutral-900">
                      <span className="mr-1.5 text-neutral-400">
                        #{order.number}
                      </span>
                      {order.customerFirstName} {order.customerLastName} ·{" "}
                      {order.customerPhone}
                    </p>
                    <p className="text-sm text-neutral-500">
                      {ORDER_TYPE_LABELS[order.orderType]}
                      {order.deliveryAddress && ` · ${order.deliveryAddress}`}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-neutral-900">
                      {formatCurrency(order.total)}
                    </p>
                    <p className="text-sm text-neutral-500">
                      {order.payment
                        ? `${PAYMENT_PROVIDER_LABELS[order.payment.provider]} · ${
                            order.payment.status === "CONFIRMED"
                              ? "Pagado"
                              : "Pendiente"
                          }`
                        : "Sin pago"}
                    </p>
                  </div>
                </div>

                <ul className="mb-3 text-sm text-neutral-600">
                  {order.items.map((item) => (
                    <li key={item.id}>
                      {item.quantity}× {item.productName}
                      {item.options.length > 0 &&
                        ` (${item.options.map((o) => o.name).join(", ")})`}
                    </li>
                  ))}
                </ul>

                {order.notes && (
                  <p className="mb-3 text-sm italic text-neutral-500">
                    Nota: {order.notes}
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-3">
                  <span className="rounded-lg bg-neutral-100 px-3 py-1.5 text-sm font-medium text-neutral-700">
                    {ORDER_STATUS_LABELS[order.status]}
                  </span>
                  {canMarkPaid && (
                    <button
                      onClick={() => markPaid(order.id)}
                      className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
                    >
                      Marcar cobrado
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={
        "rounded-lg px-3 py-1.5 text-sm font-medium " +
        (active
          ? "bg-brand-100 text-brand-700"
          : "text-neutral-500 hover:bg-neutral-100")
      }
    >
      {children}
    </button>
  );
}
