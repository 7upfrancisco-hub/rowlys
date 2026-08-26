"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api-client";
import {
  ORDER_STATUS_FLOW,
  ORDER_STATUS_LABELS,
  ORDER_TYPE_LABELS,
  PAYMENT_PROVIDER_LABELS,
  formatCurrency,
  type OrderDTO,
  type OrderStatus,
  type OrderType,
} from "@/types";

const ALL_STATUSES: OrderStatus[] = [
  "PENDING",
  "CONFIRMED",
  "IN_PROGRESS",
  "READY",
  "DELIVERED",
  "CANCELLED",
];

export default function PedidosClient() {
  const [view, setView] = useState<"activos" | "todos">("activos");
  const [orders, setOrders] = useState<OrderDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusTab, setStatusTab] = useState<OrderStatus | "ALL">("ALL");
  const [orderTypeFilter, setOrderTypeFilter] = useState<OrderType | "ALL">(
    "ALL"
  );
  const [search, setSearch] = useState("");

  function load(currentView: "activos" | "todos") {
    const query =
      currentView === "todos" ? `?status=${ALL_STATUSES.join(",")}` : "";
    apiFetch<OrderDTO[]>(`/api/orders${query}`)
      .then(setOrders)
      .catch((err: ApiError) => setError(err.message));
  }

  useEffect(() => load(view), [view]);

  async function updateOrder(
    id: string,
    body: { status?: OrderStatus; markPaid?: boolean }
  ) {
    setError(null);
    try {
      const updated = await apiFetch<OrderDTO>(`/api/admin/orders/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      setOrders((prev) =>
        prev ? prev.map((o) => (o.id === id ? updated : o)) : prev
      );
    } catch (err) {
      setError((err as ApiError).message);
    }
  }

  const filtered = useMemo(() => {
    if (!orders) return [];
    const term = search.trim().toLowerCase();
    return orders.filter((order) => {
      if (statusTab !== "ALL" && order.status !== statusTab) return false;
      if (orderTypeFilter !== "ALL" && order.orderType !== orderTypeFilter)
        return false;
      if (term) {
        const haystack = `${order.customerFirstName} ${order.customerLastName} ${order.customerPhone}`.toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });
  }, [orders, statusTab, orderTypeFilter, search]);

  const counts = useMemo(() => {
    const map = new Map<OrderStatus, number>();
    for (const order of orders ?? []) {
      map.set(order.status, (map.get(order.status) ?? 0) + 1);
    }
    return map;
  }, [orders]);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-2xl font-bold text-neutral-900">Pedidos</h2>
        <div className="flex gap-2">
          <button
            onClick={() => setView("activos")}
            className={
              "rounded-lg px-3 py-2 text-sm font-medium " +
              (view === "activos"
                ? "bg-brand-600 text-white"
                : "border border-neutral-300 text-neutral-600")
            }
          >
            Activos
          </button>
          <button
            onClick={() => setView("todos")}
            className={
              "rounded-lg px-3 py-2 text-sm font-medium " +
              (view === "todos"
                ? "bg-brand-600 text-white"
                : "border border-neutral-300 text-neutral-600")
            }
          >
            Todos
          </button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <button
          onClick={() => setStatusTab("ALL")}
          className={
            "rounded-lg px-3 py-1.5 text-sm font-medium " +
            (statusTab === "ALL"
              ? "bg-brand-100 text-brand-700"
              : "text-neutral-500 hover:bg-neutral-100")
          }
        >
          Todos ({orders?.length ?? 0})
        </button>
        {ALL_STATUSES.map((status) => (
          <button
            key={status}
            onClick={() => setStatusTab(status)}
            className={
              "rounded-lg px-3 py-1.5 text-sm font-medium " +
              (statusTab === status
                ? "bg-brand-100 text-brand-700"
                : "text-neutral-500 hover:bg-neutral-100")
            }
          >
            {ORDER_STATUS_LABELS[status]} ({counts.get(status) ?? 0})
          </button>
        ))}
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
            const nextStatuses = ORDER_STATUS_FLOW.slice(
              ORDER_STATUS_FLOW.indexOf(order.status) + 1
            );
            const canCancel =
              order.status !== "DELIVERED" && order.status !== "CANCELLED";
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
                  {nextStatuses.map((status) => (
                    <button
                      key={status}
                      onClick={() => updateOrder(order.id, { status })}
                      className="rounded-lg border border-brand-300 px-3 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-50"
                    >
                      Pasar a {ORDER_STATUS_LABELS[status]}
                    </button>
                  ))}
                  {canCancel && (
                    <button
                      onClick={() =>
                        updateOrder(order.id, { status: "CANCELLED" })
                      }
                      className="rounded-lg border border-red-300 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
                    >
                      Cancelar
                    </button>
                  )}
                  {canMarkPaid && (
                    <button
                      onClick={() => updateOrder(order.id, { markPaid: true })}
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
