"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api-client";
import LogoutButton from "@/components/LogoutButton";
import {
  ORDER_STATUS_LABELS,
  ORDER_TYPE_LABELS,
  PAYMENT_PROVIDER_LABELS,
  formatCurrency,
  type OrderDTO,
  type OrderStatus,
  type WhatsAppSendResult,
} from "@/types";

// Columnas del tablero: el flujo de cocina sin el estado final DELIVERED
// (los entregados salen del tablero). CANCELLED tampoco aparece.
const BOARD_COLUMNS: OrderStatus[] = [
  "PENDING",
  "CONFIRMED",
  "IN_PROGRESS",
  "READY",
];

const POLL_MS = 5000;
// Tras una acción manual, ignoramos el resultado del próximo poll un rato para
// que no pise el estado optimista con datos viejos.
const SUPPRESS_POLL_MS = 4000;
// Un pedido pendiente que lleva más de esto sin aceptar se resalta.
const STALE_PENDING_MS = 10 * 60 * 1000;

function relativeTime(iso: string, now: number): string {
  const diffMin = Math.floor((now - new Date(iso).getTime()) / 60000);
  if (diffMin < 1) return "recién";
  if (diffMin < 60) return `hace ${diffMin} min`;
  const h = Math.floor(diffMin / 60);
  const m = diffMin % 60;
  return m === 0 ? `hace ${h} h` : `hace ${h} h ${m} min`;
}

export default function ComandaClient() {
  const [orders, setOrders] = useState<OrderDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<
    { kind: "ok" | "warn"; text: string } | null
  >(null);
  const suppressPollUntil = useRef(0);

  function showNotice(n: { kind: "ok" | "warn"; text: string }) {
    setNotice(n);
    setTimeout(() => setNotice(null), 8000);
  }

  function whatsappNotice(r: WhatsAppSendResult) {
    if (r.status === "sent") {
      showNotice({ kind: "ok", text: "WhatsApp de confirmación enviado al cliente." });
    } else if (r.status === "mock") {
      showNotice({
        kind: "ok",
        text: `WhatsApp (simulado) a +${r.to}. Config real pendiente.`,
      });
    } else if (r.status === "failed") {
      showNotice({ kind: "warn", text: `WhatsApp no se envió: ${r.error}` });
    } else if (r.reason && !r.reason.includes("no configurado")) {
      // "no configurado" es lo normal sin credenciales — no vale la pena avisar.
      showNotice({ kind: "warn", text: `WhatsApp no se envió: ${r.reason}` });
    }
  }

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<OrderDTO[]>("/api/orders");
      if (Date.now() < suppressPollUntil.current) return;
      setOrders(data);
      setError(null);
      setLastSync(Date.now());
    } catch (err) {
      setError((err as ApiError).message);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  // Reloj para que los "hace X min" avancen sin depender del poll.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  async function mutate(
    id: string,
    body: { status?: OrderStatus; markPaid?: boolean }
  ) {
    setBusyId(id);
    setError(null);
    suppressPollUntil.current = Date.now() + SUPPRESS_POLL_MS;
    try {
      const updated = await apiFetch<
        OrderDTO & { whatsappNotification?: WhatsAppSendResult }
      >(`/api/admin/orders/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      if (updated.whatsappNotification) {
        whatsappNotice(updated.whatsappNotification);
      }
      setOrders((prev) => {
        if (!prev) return prev;
        const stillOnBoard = (BOARD_COLUMNS as OrderStatus[]).includes(
          updated.status
        );
        if (!stillOnBoard) return prev.filter((o) => o.id !== id);
        return prev.map((o) => (o.id === id ? updated : o));
      });
    } catch (err) {
      setError((err as ApiError).message);
      // Si falló, dejamos que el poll vuelva a mandar cuanto antes.
      suppressPollUntil.current = 0;
    } finally {
      setBusyId(null);
    }
  }

  function reject(order: OrderDTO) {
    if (
      !window.confirm(
        `¿Rechazar el pedido de ${order.customerFirstName} ${order.customerLastName}? El cliente lo verá como cancelado.`
      )
    )
      return;
    mutate(order.id, { status: "CANCELLED" });
  }

  const byStatus = useMemo(() => {
    const map = new Map<OrderStatus, OrderDTO[]>();
    for (const col of BOARD_COLUMNS) map.set(col, []);
    for (const order of orders ?? []) {
      map.get(order.status)?.push(order);
    }
    return map;
  }, [orders]);

  const totalActive = orders?.length ?? 0;

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-baseline gap-3">
            <h1 className="text-xl font-bold text-brand-600">Rowlys · Comanda</h1>
            <span className="text-sm text-neutral-500">
              {totalActive} {totalActive === 1 ? "pedido activo" : "pedidos activos"}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <span className="text-neutral-400">
              {lastSync
                ? `Actualizado ${new Date(lastSync).toLocaleTimeString("es-AR", {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })}`
                : "Sincronizando..."}
            </span>
            <button
              onClick={load}
              className="rounded-lg border border-neutral-300 px-3 py-1.5 font-medium text-neutral-600 hover:bg-neutral-100"
            >
              Actualizar
            </button>
            <Link
              href="/admin"
              className="font-medium text-neutral-500 hover:text-brand-600 hover:underline"
            >
              Admin
            </Link>
            <LogoutButton />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-6">
        {error && (
          <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
            {error}
          </p>
        )}

        {notice && (
          <p
            className={
              "mb-4 flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm " +
              (notice.kind === "ok"
                ? "bg-green-50 text-green-700"
                : "bg-amber-50 text-amber-800")
            }
          >
            <span>{notice.text}</span>
            <button
              onClick={() => setNotice(null)}
              className="text-xs font-medium underline"
            >
              cerrar
            </button>
          </p>
        )}

        {orders === null ? (
          <p className="text-neutral-500">Cargando...</p>
        ) : (
          <div className="flex gap-4 overflow-x-auto pb-4">
            {BOARD_COLUMNS.map((col) => {
              const items = byStatus.get(col) ?? [];
              return (
                <section
                  key={col}
                  className="flex w-80 shrink-0 flex-col rounded-2xl bg-neutral-100/70"
                >
                  <div className="flex items-center justify-between px-4 py-3">
                    <h2 className="font-semibold text-neutral-700">
                      {ORDER_STATUS_LABELS[col]}
                    </h2>
                    <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-neutral-500">
                      {items.length}
                    </span>
                  </div>
                  <div className="flex flex-1 flex-col gap-3 px-3 pb-3">
                    {items.length === 0 ? (
                      <p className="px-1 py-6 text-center text-sm text-neutral-400">
                        Sin pedidos
                      </p>
                    ) : (
                      items.map((order) => (
                        <OrderCard
                          key={order.id}
                          order={order}
                          now={now}
                          busy={busyId === order.id}
                          onMutate={mutate}
                          onReject={reject}
                        />
                      ))
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

function OrderCard({
  order,
  now,
  busy,
  onMutate,
  onReject,
}: {
  order: OrderDTO;
  now: number;
  busy: boolean;
  onMutate: (
    id: string,
    body: { status?: OrderStatus; markPaid?: boolean }
  ) => void;
  onReject: (order: OrderDTO) => void;
}) {
  const isStalePending =
    order.status === "PENDING" &&
    now - new Date(order.createdAt).getTime() > STALE_PENDING_MS;

  const paid = order.payment?.status === "CONFIRMED";
  const canMarkPaid =
    !!order.payment &&
    !paid &&
    (order.payment.provider === "CASH" ||
      order.payment.provider === "BANK_TRANSFER");

  return (
    <article
      className={
        "rounded-xl border bg-white p-4 shadow-sm " +
        (isStalePending ? "border-amber-400 ring-1 ring-amber-300" : "border-neutral-200")
      }
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <p className="font-medium leading-tight text-neutral-900">
            {order.customerFirstName} {order.customerLastName}
          </p>
          <p className="text-xs text-neutral-500">{order.customerPhone}</p>
        </div>
        <span className="whitespace-nowrap text-xs text-neutral-400">
          {relativeTime(order.createdAt, now)}
        </span>
      </div>

      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-brand-600">
        {ORDER_TYPE_LABELS[order.orderType]}
      </p>
      {order.deliveryAddress && (
        <p className="mb-2 text-sm text-neutral-600">{order.deliveryAddress}</p>
      )}

      <ul className="mb-2 flex flex-col gap-1 border-t border-neutral-100 pt-2 text-sm text-neutral-700">
        {order.items.map((item) => (
          <li key={item.id}>
            <span className="font-medium">{item.quantity}×</span> {item.productName}
            {item.options.length > 0 && (
              <span className="block pl-5 text-xs text-neutral-500">
                {item.options.map((o) => o.name).join(", ")}
              </span>
            )}
            {item.notes && (
              <span className="block pl-5 text-xs italic text-neutral-500">
                “{item.notes}”
              </span>
            )}
          </li>
        ))}
      </ul>

      {order.notes && (
        <p className="mb-2 rounded-md bg-amber-50 px-2 py-1 text-xs italic text-amber-800">
          Nota: {order.notes}
        </p>
      )}

      <div className="mb-3 flex items-center justify-between text-sm">
        <span
          className={
            "rounded-md px-2 py-0.5 text-xs font-medium " +
            (paid
              ? "bg-green-100 text-green-700"
              : "bg-neutral-100 text-neutral-600")
          }
        >
          {order.payment
            ? `${PAYMENT_PROVIDER_LABELS[order.payment.provider]} · ${
                paid ? "Pagado" : "Pendiente"
              }`
            : "Sin pago"}
        </span>
        <span className="font-semibold text-neutral-900">
          {formatCurrency(order.total)}
        </span>
      </div>

      {order.payment?.provider === "CASH" &&
        order.payment.changeFor != null && (
          <p className="mb-3 text-xs text-neutral-500">
            Paga con {formatCurrency(order.payment.changeFor)} · vuelto{" "}
            {formatCurrency(Math.max(0, order.payment.changeFor - order.total))}
          </p>
        )}

      <div className="flex flex-wrap gap-2">
        {order.status === "PENDING" && (
          <>
            <button
              disabled={busy}
              onClick={() => onMutate(order.id, { status: "CONFIRMED" })}
              className="flex-1 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              Aceptar
            </button>
            <button
              disabled={busy}
              onClick={() => onReject(order)}
              className="rounded-lg border border-red-300 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              Rechazar
            </button>
          </>
        )}

        {order.status === "CONFIRMED" && (
          <button
            disabled={busy}
            onClick={() => onMutate(order.id, { status: "IN_PROGRESS" })}
            className="flex-1 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            Empezar preparación
          </button>
        )}

        {order.status === "IN_PROGRESS" && (
          <button
            disabled={busy}
            onClick={() => onMutate(order.id, { status: "READY" })}
            className="flex-1 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            Marcar listo
          </button>
        )}

        {order.status === "READY" && (
          <button
            disabled={busy}
            onClick={() => onMutate(order.id, { status: "DELIVERED" })}
            className="flex-1 rounded-lg bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
          >
            {order.orderType === "DELIVERY" ? "Enviado" : "Entregado"}
          </button>
        )}

        {canMarkPaid && (
          <button
            disabled={busy}
            onClick={() => onMutate(order.id, { markPaid: true })}
            className="rounded-lg border border-green-400 px-3 py-1.5 text-sm font-medium text-green-700 hover:bg-green-50 disabled:opacity-50"
          >
            Cobrar
          </button>
        )}

        {order.status !== "PENDING" && (
          <button
            disabled={busy}
            onClick={() => onReject(order)}
            className="rounded-lg px-2 py-1.5 text-sm font-medium text-neutral-400 hover:text-red-600 disabled:opacity-50"
          >
            Cancelar
          </button>
        )}
      </div>
    </article>
  );
}
