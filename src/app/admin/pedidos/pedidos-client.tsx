"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api-client";
import { normalizeArPhone, whatsappLink } from "@/lib/phone";
import {
  buildComandaTicket,
  buildClienteTicket,
  type StoreInfo,
} from "@/lib/escpos";
import { getStoredPrinter, qzPrintRaw } from "@/lib/qz-print";
import {
  ORDER_STATUS_LABELS,
  ORDER_TYPE_LABELS,
  PAYMENT_PROVIDER_LABELS,
  formatCurrency,
  type OrderDTO,
  type OrderType,
} from "@/types";

const AR_TZ = "America/Argentina/Buenos_Aires";

function payStatusLabel(status: string): string {
  if (status === "CONFIRMED") return "Pagado";
  if (status === "FAILED") return "Fallido";
  return "Pendiente";
}

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.149-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.71.306 1.263.489 1.694.625.712.227 1.36.195 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

function fmtDateTime(iso: string): string {
  const dt = new Date(iso);
  return (
    dt.toLocaleDateString("es-AR", { timeZone: AR_TZ }) +
    " " +
    dt.toLocaleTimeString("es-AR", {
      timeZone: AR_TZ,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
  );
}

// Total de una línea: (precio unitario + adicionales) × cantidad.
function lineTotal(item: OrderDTO["items"][number]): number {
  const opts = item.options.reduce((s, o) => s + o.price, 0);
  return (item.price + opts) * item.quantity;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Imprime un pedido: si hay una comandera configurada en esta PC (QZ Tray),
// manda los dos tickets ESC/POS (comanda + cliente). Si no, cae al popup del
// navegador con la comanda de cocina.
async function printOrder(order: OrderDTO, store: StoreInfo): Promise<void> {
  const printer = getStoredPrinter();
  if (printer) {
    try {
      await qzPrintRaw(printer, [
        buildComandaTicket(order, store),
        buildClienteTicket(order, store),
      ]);
      return;
    } catch {
      /* QZ Tray no disponible: seguimos con el popup */
    }
  }
  printComandaPopup(order, store);
}

// Abre una ventana con la comanda del pedido y dispara la impresión. El ticket
// se auto-imprime y se cierra solo (script embebido en el HTML).
function printComandaPopup(order: OrderDTO, store: StoreInfo): void {
  const storeName = store.name;
  const money = (n: number) => formatCurrency(Math.round(n));
  const rows = order.items
    .map((it) => {
      const opts = it.options.length
        ? `<div class="sub">${escapeHtml(
            it.options.map((o) => o.name).join(", ")
          )}</div>`
        : "";
      const note = it.notes
        ? `<div class="sub">Nota: ${escapeHtml(it.notes)}</div>`
        : "";
      return `<tr><td class="q">${it.quantity}×</td><td>${escapeHtml(
        it.productName
      )}${opts}${note}</td><td class="p">${money(lineTotal(it))}</td></tr>`;
    })
    .join("");
  const subtotal = order.total - order.deliveryFee;
  const pay = order.payment
    ? `${PAYMENT_PROVIDER_LABELS[order.payment.provider]} · ${payStatusLabel(
        order.payment.status
      )}`
    : "Sin pago";
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>Comanda #${order.number}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: "Courier New", ui-monospace, monospace; font-size: 12px; color: #000; margin: 0; padding: 10px 12px; width: 280px; }
  h1 { font-size: 15px; text-align: center; margin: 0 0 2px; }
  .muted { color: #333; }
  .center { text-align: center; }
  .num { font-size: 20px; font-weight: bold; text-align: center; margin: 6px 0; }
  hr { border: none; border-top: 1px dashed #000; margin: 8px 0; }
  table { width: 100%; border-collapse: collapse; }
  td { vertical-align: top; padding: 2px 0; }
  td.q { width: 28px; }
  td.p { text-align: right; white-space: nowrap; padding-left: 6px; }
  .sub { font-size: 11px; color: #333; padding-left: 2px; }
  .tot { display: flex; justify-content: space-between; }
  .tot.big { font-weight: bold; font-size: 14px; }
</style></head><body>
  <h1>${escapeHtml(storeName)}</h1>
  <div class="center muted">COMANDA</div>
  <div class="num">#${order.number}</div>
  <div class="center muted">${fmtDateTime(order.createdAt)}</div>
  <hr>
  <div>${order.orderType === "DELIVERY" ? "ENVÍO A DOMICILIO" : "RETIRO EN EL LOCAL"}</div>
  <div>${escapeHtml(order.customerFirstName)} ${escapeHtml(order.customerLastName)}</div>
  <div class="muted">${escapeHtml(order.customerPhone)}</div>
  ${order.deliveryAddress ? `<div class="muted">${escapeHtml(order.deliveryAddress)}</div>` : ""}
  <hr>
  <table>${rows}</table>
  <hr>
  <div class="tot"><span>Subtotal</span><span>${money(subtotal)}</span></div>
  ${order.deliveryFee > 0 ? `<div class="tot"><span>Envío</span><span>${money(order.deliveryFee)}</span></div>` : ""}
  <div class="tot big"><span>TOTAL</span><span>${money(order.total)}</span></div>
  <div class="muted" style="margin-top:4px">${escapeHtml(pay)}</div>
  ${order.notes ? `<hr><div><b>Nota:</b> ${escapeHtml(order.notes)}</div>` : ""}
  <script>
    window.onload = function () {
      window.print();
      setTimeout(function () { window.close(); }, 200);
    };
  </script>
</body></html>`;
  const w = window.open("", "_blank", "width=360,height=640");
  if (!w) {
    alert("Habilitá las ventanas emergentes para imprimir la comanda.");
    return;
  }
  w.document.write(html);
  w.document.close();
}

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
  const [store, setStore] = useState<StoreInfo>({
    name: "Blend",
    address: null,
    phone: null,
  });
  // Menú de 3 puntos abierto (id del pedido) y modal activo.
  const [menuId, setMenuId] = useState<string | null>(null);
  const [modal, setModal] = useState<{
    kind: "details" | "contact";
    order: OrderDTO;
  } | null>(null);
  // Pedidos MP sin pagar (fantasma): { pending, stale, hours }.
  const [unpaid, setUnpaid] = useState<{
    pending: number;
    stale: number;
    hours: number;
  } | null>(null);
  const [cleaning, setCleaning] = useState(false);

  function load() {
    apiFetch<OrderDTO[]>("/api/orders?status=DELIVERED,CANCELLED")
      .then(setOrders)
      .catch((err: ApiError) => setError(err.message));
  }
  useEffect(load, []);

  function loadUnpaid() {
    apiFetch<{ pending: number; stale: number; hours: number }>(
      "/api/admin/orders/cleanup-unpaid"
    )
      .then(setUnpaid)
      .catch(() => setUnpaid(null));
  }
  useEffect(loadUnpaid, []);

  async function cleanupUnpaid() {
    setCleaning(true);
    setError(null);
    try {
      await apiFetch<{ cancelled: number }>(
        "/api/admin/orders/cleanup-unpaid",
        { method: "POST" }
      );
      load();
      loadUnpaid();
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setCleaning(false);
    }
  }

  useEffect(() => {
    apiFetch<{
      storeName?: string;
      storeAddress?: string | null;
      storePhone?: string | null;
      prepTimeDeliveryMinutes?: number;
      prepTimePickupMinutes?: number;
    }>("/api/settings")
      .then((s) => {
        setStore({
          name: s?.storeName || "Blend",
          address: s?.storeAddress ?? null,
          phone: s?.storePhone ?? null,
          prepMinutes: {
            delivery: s?.prepTimeDeliveryMinutes ?? 10,
            pickup: s?.prepTimePickupMinutes ?? 10,
          },
        });
      })
      .catch(() => {});
  }, []);

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
    return orders
      .filter((order) => {
        if (order.status !== tab) return false;
        if (orderTypeFilter !== "ALL" && order.orderType !== orderTypeFilter)
          return false;
        if (term) {
          const haystack =
            `${order.customerFirstName} ${order.customerLastName} ${order.customerPhone}`.toLowerCase();
          if (!haystack.includes(term)) return false;
        }
        return true;
      })
      // Más reciente arriba: por número de pedido descendente.
      .sort((a, b) => b.number - a.number);
  }, [orders, tab, orderTypeFilter, search]);

  // Exporta a PDF la lista que se está viendo (respeta pestaña, canal y buscador).
  async function exportPdf() {
    const { downloadPdfReport } = await import("@/lib/pdf-report");
    const isCancelled = tab === "CANCELLED";
    const detailCol = isCancelled ? "Motivo" : "Ítems";
    const columns = [
      "Nº",
      "Fecha",
      "Estado",
      "Canal",
      "Cliente",
      "Teléfono",
      detailCol,
      "Medio de pago",
      "Estado de pago",
      "Total",
    ];
    const rows = filtered.map((o) => {
      const dt = new Date(o.createdAt);
      const fecha =
        dt.toLocaleDateString("es-AR", { timeZone: AR_TZ }) +
        " " +
        dt.toLocaleTimeString("es-AR", {
          timeZone: AR_TZ,
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        });
      const detail = isCancelled
        ? o.cancelReason ?? "—"
        : o.items
            .map((it) => {
              const opts = it.options.length
                ? ` (${it.options.map((op) => op.name).join(", ")})`
                : "";
              return `${it.quantity}× ${it.productName}${opts}`;
            })
            .join(", ");
      return [
        o.number,
        fecha,
        ORDER_STATUS_LABELS[o.status],
        o.orderType === "DELIVERY" ? "Envío" : "Retiro",
        `${o.customerFirstName} ${o.customerLastName}`.trim(),
        o.customerPhone,
        detail,
        o.payment ? PAYMENT_PROVIDER_LABELS[o.payment.provider] : "—",
        o.payment ? payStatusLabel(o.payment.status) : "—",
        formatCurrency(Math.round(o.total)),
      ];
    });
    const total = filtered.reduce((s, o) => s + o.total, 0);
    const chan =
      orderTypeFilter === "ALL"
        ? "todos los canales"
        : ORDER_TYPE_LABELS[orderTypeFilter].toLowerCase();
    const term = search.trim();
    const tag = isCancelled ? "cancelados" : "finalizados";
    const today = new Date().toISOString().slice(0, 10);
    downloadPdfReport({
      filename: `blend-pedidos-${tag}-${today}.pdf`,
      title: "Blend · Historial de pedidos",
      subtitle:
        `${isCancelled ? "Cancelados" : "Finalizados"} · ${chan}` +
        (term ? ` · buscando "${term}"` : ""),
      summary: [
        `${filtered.length} pedido${filtered.length === 1 ? "" : "s"}`,
        `Total: ${formatCurrency(total)}`,
      ],
      columns,
      rows,
      numericCols: [9],
      wideCol: 6,
    });
  }

  return (
    <div>
      <h2 className="mb-1 text-2xl font-bold text-navy-900">
        Historial de pedidos
      </h2>
      <p className="mb-6 text-sm text-neutral-500">
        Pedidos ya entregados y cancelados. Los pedidos en curso se gestionan
        desde la comanda.
      </p>

      {unpaid && unpaid.pending > 0 && (
        <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span>
            {unpaid.pending}{" "}
            {unpaid.pending === 1
              ? "pedido con pago sin confirmar"
              : "pedidos con pago sin confirmar"}
            {unpaid.stale > 0 && (
              <>
                {" "}
                · <strong>{unpaid.stale}</strong> de más de {unpaid.hours} h
              </>
            )}
            . Se cancelan solos pasadas las {unpaid.hours} h.
          </span>
          {unpaid.stale > 0 && (
            <button
              onClick={cleanupUnpaid}
              disabled={cleaning}
              className="ml-auto rounded-lg border border-amber-300 bg-white px-3 py-1.5 font-medium text-amber-800 transition hover:bg-amber-100 disabled:opacity-50"
            >
              {cleaning ? "Cancelando..." : `Cancelar los ${unpaid.stale} vencidos`}
            </button>
          )}
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <TabBtn active={tab === "DELIVERED"} onClick={() => setTab("DELIVERED")}>
          Finalizados ({counts.delivered})
        </TabBtn>
        <TabBtn active={tab === "CANCELLED"} onClick={() => setTab("CANCELLED")}>
          Cancelados ({counts.cancelled})
        </TabBtn>
        <button
          onClick={exportPdf}
          disabled={filtered.length === 0}
          className="ml-auto rounded-lg border border-neutral-200 px-3 py-1.5 text-sm font-medium text-neutral-600 transition hover:border-brand-300 hover:text-brand-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Exportar PDF ({filtered.length})
        </button>
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
                  <div className="flex items-start gap-2">
                    <div className="text-right">
                      <p className="font-semibold text-neutral-900">
                        {formatCurrency(order.total)}
                      </p>
                      <p className="text-sm text-neutral-500">
                        {order.payment
                          ? `${
                              PAYMENT_PROVIDER_LABELS[order.payment.provider]
                            } · ${
                              order.payment.status === "CONFIRMED"
                                ? "Pagado"
                                : "Pendiente"
                            }`
                          : "Sin pago"}
                      </p>
                    </div>
                    <div className="relative -mr-1">
                      <button
                        type="button"
                        onClick={() =>
                          setMenuId((v) => (v === order.id ? null : order.id))
                        }
                        aria-label="Más acciones"
                        className="rounded-md px-1.5 py-0.5 text-lg leading-none text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
                      >
                        ⋯
                      </button>
                      {menuId === order.id && (
                        <>
                          <button
                            type="button"
                            tabIndex={-1}
                            aria-hidden="true"
                            className="fixed inset-0 z-10 cursor-default"
                            onClick={() => setMenuId(null)}
                          />
                          <div className="absolute right-0 z-20 mt-1 w-52 overflow-hidden rounded-lg border border-neutral-200 bg-white py-1 text-sm shadow-lg">
                            <button
                              type="button"
                              onClick={() => {
                                setMenuId(null);
                                setModal({ kind: "details", order });
                              }}
                              className="block w-full px-3 py-2 text-left text-neutral-700 hover:bg-neutral-50"
                            >
                              Ver detalles
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setMenuId(null);
                                setModal({ kind: "contact", order });
                              }}
                              className="block w-full px-3 py-2 text-left text-neutral-700 hover:bg-neutral-50"
                            >
                              Contactar cliente
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setMenuId(null);
                                void printOrder(order, store);
                              }}
                              className="block w-full px-3 py-2 text-left text-neutral-700 hover:bg-neutral-50"
                            >
                              Imprimir comanda
                            </button>
                          </div>
                        </>
                      )}
                    </div>
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

                {order.status === "CANCELLED" && order.cancelReason && (
                  <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                    Motivo de cancelación: {order.cancelReason}
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

      {modal?.kind === "details" && (
        <DetailsModal order={modal.order} onClose={() => setModal(null)} />
      )}
      {modal?.kind === "contact" && (
        <ContactModal order={modal.order} onClose={() => setModal(null)} />
      )}
    </div>
  );
}

function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-navy-900">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded-md px-2 py-0.5 text-xl leading-none text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function DetailsModal({
  order,
  onClose,
}: {
  order: OrderDTO;
  onClose: () => void;
}) {
  const subtotal = order.total - order.deliveryFee;
  return (
    <ModalShell title={`Pedido #${order.number}`} onClose={onClose}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-lg bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-700">
          {ORDER_STATUS_LABELS[order.status]}
        </span>
        <span className="text-sm text-neutral-500">
          {ORDER_TYPE_LABELS[order.orderType]}
        </span>
      </div>

      <dl className="mt-4 space-y-1 text-sm">
        <Row label="Creado" value={fmtDateTime(order.createdAt)} />
        {order.status === "DELIVERED" && (
          <Row label="Entregado" value={fmtDateTime(order.updatedAt)} />
        )}
        {order.status === "CANCELLED" && (
          <Row label="Cancelado" value={fmtDateTime(order.updatedAt)} />
        )}
      </dl>

      <div className="mt-4 border-t border-neutral-100 pt-3 text-sm">
        <p className="font-semibold text-neutral-900">
          {order.customerFirstName} {order.customerLastName}
        </p>
        <p className="text-neutral-600">{order.customerPhone}</p>
        {order.customerEmail && (
          <p className="text-neutral-600">{order.customerEmail}</p>
        )}
        {order.deliveryAddress && (
          <p className="text-neutral-600">{order.deliveryAddress}</p>
        )}
        <p className="mt-1 text-neutral-500">
          {order.payment
            ? `${PAYMENT_PROVIDER_LABELS[order.payment.provider]} · ${payStatusLabel(
                order.payment.status
              )}`
            : "Sin pago"}
        </p>
      </div>

      <div className="mt-4 border-t border-neutral-100 pt-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">
          Productos
        </p>
        <ul className="space-y-1.5 text-sm">
          {order.items.map((item) => (
            <li key={item.id} className="flex justify-between gap-3">
              <span className="text-neutral-700">
                <span className="font-medium">{item.quantity}×</span>{" "}
                {item.productName}
                {item.options.length > 0 && (
                  <span className="text-neutral-500">
                    {" "}
                    ({item.options.map((o) => o.name).join(", ")})
                  </span>
                )}
                {item.notes && (
                  <span className="block text-xs italic text-neutral-500">
                    {item.notes}
                  </span>
                )}
              </span>
              <span className="whitespace-nowrap text-neutral-600">
                {formatCurrency(lineTotal(item))}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {order.notes && (
        <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm italic text-amber-800">
          Nota: {order.notes}
        </p>
      )}

      {order.status === "CANCELLED" && order.cancelReason && (
        <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          Motivo de cancelación: {order.cancelReason}
        </p>
      )}

      <div className="mt-4 space-y-1 border-t border-neutral-100 pt-3 text-sm">
        <div className="flex justify-between text-neutral-600">
          <span>Subtotal</span>
          <span>{formatCurrency(subtotal)}</span>
        </div>
        {order.deliveryFee > 0 && (
          <div className="flex justify-between text-neutral-600">
            <span>Envío</span>
            <span>{formatCurrency(order.deliveryFee)}</span>
          </div>
        )}
        <div className="flex justify-between font-semibold text-neutral-900">
          <span>Total</span>
          <span>{formatCurrency(order.total)}</span>
        </div>
      </div>
    </ModalShell>
  );
}

function ContactModal({
  order,
  onClose,
}: {
  order: OrderDTO;
  onClose: () => void;
}) {
  const waLink = whatsappLink(
    order.customerPhone,
    `Hola ${order.customerFirstName}, te escribimos por tu pedido #${order.number}.`
  );
  const canWhatsApp = normalizeArPhone(order.customerPhone) !== null;

  return (
    <ModalShell title="Contactar cliente" onClose={onClose}>
      <p className="font-semibold text-neutral-900">
        {order.customerFirstName} {order.customerLastName}
      </p>
      <p className="mt-1 text-sm text-neutral-600">{order.customerPhone}</p>

      <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-neutral-400">
        Email
      </p>
      {order.customerEmail ? (
        <p className="text-sm text-neutral-700">{order.customerEmail}</p>
      ) : (
        <p className="text-sm italic text-neutral-400">
          El cliente no cargó un email.
        </p>
      )}

      <div className="mt-5 flex flex-col gap-2">
        <a
          href={canWhatsApp ? waLink ?? undefined : undefined}
          target="_blank"
          rel="noopener noreferrer"
          aria-disabled={!canWhatsApp}
          className={
            "flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white " +
            (canWhatsApp
              ? "bg-[#25D366] hover:bg-[#1ebe5b]"
              : "pointer-events-none bg-neutral-300")
          }
        >
          <WhatsAppIcon className="h-4 w-4" />
          {canWhatsApp
            ? "Escribir por WhatsApp"
            : "Teléfono no válido para WhatsApp"}
        </a>
        {order.customerEmail && (
          <a
            href={`mailto:${order.customerEmail}?subject=${encodeURIComponent(
              `Tu pedido #${order.number}`
            )}`}
            className="flex items-center justify-center gap-2 rounded-lg border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50"
          >
            Enviar email
          </a>
        )}
      </div>
    </ModalShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-neutral-400">{label}</dt>
      <dd className="text-neutral-700">{value}</dd>
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
