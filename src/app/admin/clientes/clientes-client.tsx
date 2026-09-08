"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api-client";
import { normalizeArPhone, whatsappLink } from "@/lib/phone";
import {
  ORDER_STATUS_LABELS,
  ORDER_TYPE_LABELS,
  formatCurrency,
  type CustomerDTO,
  type CustomerDetailDTO,
} from "@/types";

const AR_TZ = "America/Argentina/Buenos_Aires";

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-AR", {
    timeZone: AR_TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
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

type Sort = "recent" | "orders" | "spent" | "name";

const SORTS: { value: Sort; label: string }[] = [
  { value: "recent", label: "Último pedido" },
  { value: "orders", label: "Más pedidos" },
  { value: "spent", label: "Más gastado" },
  { value: "name", label: "Nombre" },
];

export default function ClientesClient() {
  const [rows, setRows] = useState<CustomerDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<Sort>("recent");
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      const qs = new URLSearchParams({ sort });
      if (search.trim()) qs.set("search", search.trim());
      apiFetch<CustomerDTO[]>(`/api/admin/customers?${qs.toString()}`)
        .then(setRows)
        .catch((err: ApiError) => setError(err.message));
    }, 250);
    return () => clearTimeout(t);
  }, [search, sort]);

  const total = rows?.length ?? 0;

  return (
    <div>
      <h2 className="mb-1 text-2xl font-bold text-navy-900">Clientes</h2>
      <p className="mb-6 text-sm text-neutral-500">
        Todos los que compraron alguna vez, agrupados por teléfono. Pedidos y
        total gastado cuentan solo pedidos aceptados por el local.
      </p>

      <div className="mb-4 flex flex-wrap gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre o teléfono"
          className="flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
        />
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as Sort)}
          className="rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
        >
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {rows === null ? (
        <p className="text-neutral-500">Cargando...</p>
      ) : total === 0 ? (
        <p className="text-neutral-500">
          {search.trim()
            ? "Ningún cliente coincide."
            : "Todavía no hay clientes."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-neutral-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
                <th className="px-4 py-2.5 font-medium">Cliente</th>
                <th className="px-4 py-2.5 font-medium">Teléfono</th>
                <th className="px-4 py-2.5 text-right font-medium">Pedidos</th>
                <th className="px-4 py-2.5 text-right font-medium">
                  Total gastado
                </th>
                <th className="px-4 py-2.5 font-medium">Último pedido</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => setOpenId(c.id)}
                  className="cursor-pointer border-b border-neutral-100 last:border-0 hover:bg-brand-50/40"
                >
                  <td className="px-4 py-2.5 font-medium text-neutral-900">
                    {c.firstName} {c.lastName}
                  </td>
                  <td className="px-4 py-2.5 text-neutral-600">{c.phone}</td>
                  <td className="px-4 py-2.5 text-right text-neutral-700">
                    {c.ordersCount}
                  </td>
                  <td className="px-4 py-2.5 text-right text-neutral-700">
                    {formatCurrency(c.totalSpent)}
                  </td>
                  <td className="px-4 py-2.5 text-neutral-600">
                    {fmtDate(c.lastOrderAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {rows && (
        <p className="mt-3 text-xs text-neutral-400">
          {total} {total === 1 ? "cliente" : "clientes"}
        </p>
      )}

      {openId && (
        <CustomerModal id={openId} onClose={() => setOpenId(null)} />
      )}
    </div>
  );
}

function CustomerModal({
  id,
  onClose,
}: {
  id: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<CustomerDetailDTO | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<CustomerDetailDTO>(`/api/admin/customers/${id}`)
      .then(setData)
      .catch((err: ApiError) => setError(err.message));
  }, [id]);

  const wa = useMemo(() => {
    if (!data) return null;
    return whatsappLink(
      data.phone,
      `Hola ${data.firstName}, te escribimos de la tienda.`
    );
  }, [data]);
  const canWhatsApp = data ? normalizeArPhone(data.phone) !== null : false;

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h3 className="text-lg font-bold text-navy-900">
            {data ? `${data.firstName} ${data.lastName}` : "Cliente"}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded-md px-2 py-0.5 text-xl leading-none text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
          >
            ×
          </button>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {!data && !error && <p className="text-neutral-500">Cargando...</p>}

        {data && (
          <>
            <div className="text-sm">
              <p className="text-neutral-600">{data.phone}</p>
              {data.email && (
                <p className="text-neutral-600">{data.email}</p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <a
                  href={canWhatsApp ? wa ?? undefined : undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-disabled={!canWhatsApp}
                  className={
                    "rounded-lg px-3 py-1.5 text-sm font-semibold text-white " +
                    (canWhatsApp
                      ? "bg-[#25D366] hover:bg-[#1ebe5b]"
                      : "pointer-events-none bg-neutral-300")
                  }
                >
                  WhatsApp
                </a>
                {data.email && (
                  <a
                    href={`mailto:${data.email}`}
                    className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-50"
                  >
                    Email
                  </a>
                )}
              </div>
            </div>

            <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-neutral-100 pt-4 text-sm">
              <Stat label="Pedidos" value={String(data.ordersCount)} />
              <Stat
                label="Total gastado"
                value={formatCurrency(data.totalSpent)}
              />
              <Stat label="Cliente desde" value={fmtDate(data.firstOrderAt)} />
              <Stat label="Último pedido" value={fmtDate(data.lastOrderAt)} />
            </dl>

            {data.addresses.length > 0 && (
              <div className="mt-4 border-t border-neutral-100 pt-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">
                  Direcciones de envío usadas
                </p>
                <ul className="space-y-1 text-sm text-neutral-700">
                  {data.addresses.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-4 border-t border-neutral-100 pt-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">
                Historial de pedidos ({data.orders.length})
              </p>
              <ul className="space-y-2">
                {data.orders.map((o) => (
                  <li
                    key={o.id}
                    className="rounded-lg border border-neutral-200 p-3 text-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <span className="font-medium text-neutral-900">
                          #{o.number}
                        </span>{" "}
                        <span className="text-neutral-500">
                          {fmtDateTime(o.createdAt)}
                        </span>
                        <p className="text-xs text-neutral-500">
                          {ORDER_TYPE_LABELS[o.orderType]} ·{" "}
                          {ORDER_STATUS_LABELS[o.status]}
                        </p>
                      </div>
                      <span className="whitespace-nowrap font-semibold text-neutral-900">
                        {formatCurrency(o.total)}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-neutral-600">
                      {o.items
                        .map((it) => `${it.quantity}× ${it.productName}`)
                        .join(", ")}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-neutral-400">
        {label}
      </dt>
      <dd className="font-semibold text-neutral-800">{value}</dd>
    </div>
  );
}
