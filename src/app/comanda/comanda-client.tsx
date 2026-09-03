"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api-client";
import { normalizeArPhone, whatsappLink } from "@/lib/phone";
import { playDoorbell, unlockDoorbell } from "@/lib/doorbell";
import { buildDriverMessage } from "@/lib/driver-message";
import LogoutButton from "@/components/LogoutButton";
import AdminNav from "@/components/AdminNav";
import NewOrderModal from "./new-order-modal";
import {
  ORDER_STATUS_LABELS,
  PAYMENT_PROVIDER_LABELS,
  formatCurrency,
  type DriverDTO,
  type OrderDTO,
  type OrderStatus,
  type WhatsAppSendResult,
} from "@/types";

// Cambios que un PATCH a /api/admin/orders/[id] puede aplicar desde la comanda.
type OrderPatch = {
  status?: OrderStatus;
  markPaid?: boolean;
  driverId?: string | null;
  extraDelayMinutes?: number;
  // Obligatorio cuando status === "CANCELLED".
  cancelReason?: string;
};

// Opciones del selector de demora por pedido.
const DELAY_OPTIONS = [0, 10, 15, 20, 30, 45, 60];

type DayMetrics = {
  orders: number;
  revenue: number;
  cashPending: number;
  byStatus: Record<OrderStatus, number>;
};

// Columnas del tablero: el flujo de cocina sin el estado final DELIVERED
// (los entregados salen del tablero). CANCELLED tampoco aparece.
const BOARD_COLUMNS: OrderStatus[] = [
  "PENDING",
  "CONFIRMED",
  "IN_PROGRESS",
  "READY",
];

const POLL_MS = 5000;
// Preferencia del timbre de pedidos nuevos (persiste en el navegador del local).
const SOUND_KEY = "rowlys-comanda-sound";
// Tras una acción manual, ignoramos el resultado del próximo poll un rato para
// que no pise el estado optimista con datos viejos.
const SUPPRESS_POLL_MS = 4000;
// Un pedido pendiente que lleva más de esto sin aceptar se resalta.
const STALE_PENDING_MS = 10 * 60 * 1000;

// Mensaje pre-cargado para el botón manual de WhatsApp. Se adapta al estado del
// pedido para que sirva en cualquier columna del tablero, no solo al confirmar.
function whatsappMessage(
  order: OrderDTO,
  storeName: string,
  trackUrl: string
): string {
  const hi = `Hola ${order.customerFirstName}`;
  let mid: string;
  switch (order.status) {
    case "PENDING":
      mid = `, recibimos tu pedido en ${storeName} y lo estamos revisando.`;
      break;
    case "CONFIRMED":
      mid = `, ¡tu pedido en ${storeName} fue confirmado! Ya lo preparamos.`;
      break;
    case "IN_PROGRESS":
      mid = `, tu pedido en ${storeName} ya está en preparación.`;
      break;
    case "READY":
      mid =
        order.orderType === "DELIVERY"
          ? `, tu pedido de ${storeName} ya salió para tu domicilio.`
          : `, tu pedido en ${storeName} está listo para retirar.`;
      break;
    default:
      mid = `, te escribimos por tu pedido en ${storeName}.`;
  }
  return `${hi}${mid}\n\nSeguí el estado de tu pedido acá: ${trackUrl}`;
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

function relativeTime(iso: string, now: number): string {
  const diffMin = Math.floor((now - new Date(iso).getTime()) / 60000);
  if (diffMin < 1) return "recién";
  if (diffMin < 60) return `hace ${diffMin} min`;
  const h = Math.floor(diffMin / 60);
  const m = diffMin % 60;
  return m === 0 ? `hace ${h} h` : `hace ${h} h ${m} min`;
}

function StatusToggle({
  label,
  on,
  busy,
  disabled,
  onToggle,
}: {
  label: string;
  on: boolean;
  busy: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={busy || disabled}
      className={
        "inline-flex items-center gap-2 rounded-full border px-3 py-1 font-medium transition disabled:opacity-50 " +
        (on
          ? "border-green-300 bg-green-50 text-green-700"
          : "border-neutral-300 bg-neutral-100 text-neutral-500")
      }
    >
      <span
        className={
          "h-2 w-2 rounded-full " + (on ? "bg-green-500" : "bg-neutral-400")
        }
      />
      {label}
    </button>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: boolean;
}) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="text-xs uppercase tracking-wide text-neutral-400">
        {label}
      </span>
      <span
        className={
          "font-semibold " + (accent ? "text-amber-600" : "text-neutral-800")
        }
      >
        {value}
      </span>
    </span>
  );
}

export default function ComandaClient() {
  const [orders, setOrders] = useState<OrderDTO[] | null>(null);
  const [storeName, setStoreName] = useState("Rowlys");
  const [storeStatus, setStoreStatus] = useState<{
    storeOpen: boolean;
    deliveryEnabled: boolean;
    pickupEnabled: boolean;
  } | null>(null);
  // Demora de preparación por canal (minutos). null hasta cargar settings.
  const [prepTimes, setPrepTimes] = useState<{
    delivery: number;
    pickup: number;
  } | null>(null);
  const [prepDrafts, setPrepDrafts] = useState({ delivery: "", pickup: "" });
  const [channelsOpen, setChannelsOpen] = useState(false);
  const [metrics, setMetrics] = useState<DayMetrics | null>(null);
  const [statusBusy, setStatusBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<
    { kind: "ok" | "warn"; text: string } | null
  >(null);
  const [soundOn, setSoundOn] = useState(false);
  const [newOrderOpen, setNewOrderOpen] = useState(false);
  // Pedido que el trabajador está por cancelar + el motivo que escribe.
  const [rejectTarget, setRejectTarget] = useState<OrderDTO | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [drivers, setDrivers] = useState<DriverDTO[]>([]);
  const suppressPollUntil = useRef(0);
  // Ids de pedidos ya vistos; null hasta la primera carga (que no hace sonar nada).
  const seenOrderIds = useRef<Set<string> | null>(null);
  // Espejo de `soundOn` para leerlo dentro de `load` sin recrear el callback.
  const soundOnRef = useRef(false);

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

      // Timbre: suena si aparece un pedido nuevo en PENDING. La primera carga
      // solo siembra los ids conocidos (no suena al abrir la comanda).
      if (seenOrderIds.current === null) {
        seenOrderIds.current = new Set(data.map((o) => o.id));
      } else {
        const isNew =
          soundOnRef.current &&
          data.some(
            (o) => o.status === "PENDING" && !seenOrderIds.current!.has(o.id)
          );
        for (const o of data) seenOrderIds.current.add(o.id);
        if (isNew) playDoorbell();
      }

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

  // Preferencia de sonido guardada + destrabar el audio en el primer gesto
  // (los navegadores arrancan el AudioContext "suspended" hasta que hay click).
  useEffect(() => {
    try {
      // Activado salvo que se haya apagado explícitamente.
      const on = localStorage.getItem(SOUND_KEY) !== "0";
      setSoundOn(on);
      soundOnRef.current = on;
    } catch {
      /* localStorage no disponible */
    }
    const unlock = () => unlockDoorbell();
    window.addEventListener("pointerdown", unlock, { once: true });
    return () => window.removeEventListener("pointerdown", unlock);
  }, []);

  function toggleSound() {
    setSoundOn((prev) => {
      const next = !prev;
      soundOnRef.current = next;
      try {
        localStorage.setItem(SOUND_KEY, next ? "1" : "0");
      } catch {
        /* ignora */
      }
      if (next) {
        unlockDoorbell();
        playDoorbell(); // confirma que se escucha y destraba el audio
      }
      return next;
    });
  }

  // Nombre + estado del local (endpoint público). El nombre alimenta el
  // mensaje de WhatsApp; el estado, los toggles de canal del header.
  useEffect(() => {
    apiFetch<{
      storeName?: string;
      storeOpen: boolean;
      deliveryEnabled: boolean;
      pickupEnabled: boolean;
      prepTimeDeliveryMinutes?: number;
      prepTimePickupMinutes?: number;
    }>("/api/settings")
      .then((s) => {
        if (s?.storeName) setStoreName(s.storeName);
        setStoreStatus({
          storeOpen: s.storeOpen,
          deliveryEnabled: s.deliveryEnabled,
          pickupEnabled: s.pickupEnabled,
        });
        const delivery = s.prepTimeDeliveryMinutes ?? 10;
        const pickup = s.prepTimePickupMinutes ?? 10;
        setPrepTimes({ delivery, pickup });
        setPrepDrafts({ delivery: String(delivery), pickup: String(pickup) });
      })
      .catch(() => {});
  }, []);

  async function savePrepTime(channel: "delivery" | "pickup") {
    if (!prepTimes) return;
    const value = Number(prepDrafts[channel]);
    if (
      !Number.isFinite(value) ||
      value < 0 ||
      value > 240 ||
      value === prepTimes[channel]
    ) {
      setPrepDrafts((d) => ({ ...d, [channel]: String(prepTimes[channel]) }));
      return;
    }
    const prev = prepTimes;
    setPrepTimes({ ...prepTimes, [channel]: value }); // optimista
    const field =
      channel === "delivery"
        ? "prepTimeDeliveryMinutes"
        : "prepTimePickupMinutes";
    try {
      await apiFetch("/api/admin/settings", {
        method: "PATCH",
        body: JSON.stringify({ [field]: value }),
      });
    } catch (err) {
      setPrepTimes(prev);
      setPrepDrafts((d) => ({ ...d, [channel]: String(prev[channel]) }));
      showNotice({ kind: "warn", text: (err as ApiError).message });
    }
  }

  // Repartidores para el selector de asignación de los pedidos de envío.
  const loadDrivers = useCallback(() => {
    apiFetch<DriverDTO[]>("/api/admin/drivers")
      .then(setDrivers)
      .catch(() => {});
  }, []);
  useEffect(() => {
    loadDrivers();
  }, [loadDrivers]);

  // Métricas del día (barra superior). Se refresca sola y tras cada acción.
  const loadMetrics = useCallback(() => {
    apiFetch<DayMetrics>("/api/admin/metrics")
      .then(setMetrics)
      .catch(() => {});
  }, []);
  useEffect(() => {
    loadMetrics();
    const id = setInterval(loadMetrics, 60000);
    return () => clearInterval(id);
  }, [loadMetrics]);

  async function toggleStoreFlag(
    field: "storeOpen" | "deliveryEnabled" | "pickupEnabled"
  ) {
    if (!storeStatus) return;
    const next = { ...storeStatus, [field]: !storeStatus[field] };
    setStoreStatus(next); // optimista
    setStatusBusy(field);
    try {
      await apiFetch("/api/admin/settings", {
        method: "PATCH",
        body: JSON.stringify({ [field]: next[field] }),
      });
    } catch (err) {
      setStoreStatus(storeStatus); // revierte
      showNotice({ kind: "warn", text: (err as ApiError).message });
    } finally {
      setStatusBusy(null);
    }
  }

  async function mutate(id: string, body: OrderPatch) {
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
      loadMetrics();
    } catch (err) {
      setError((err as ApiError).message);
      // Si falló, dejamos que el poll vuelva a mandar cuanto antes.
      suppressPollUntil.current = 0;
    } finally {
      setBusyId(null);
    }
  }

  // Abre el modal de cancelación. El motivo es obligatorio (anti-abuso: se
  // factura por pedido, así que cancelar tiene que dejar rastro).
  function reject(order: OrderDTO) {
    setRejectReason("");
    setRejectTarget(order);
  }

  function confirmReject() {
    if (!rejectTarget) return;
    const reason = rejectReason.trim();
    if (reason.length < 3) return;
    const id = rejectTarget.id;
    setRejectTarget(null);
    mutate(id, { status: "CANCELLED", cancelReason: reason });
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
              aria-label="Actualizar"
              title="Actualizar ahora"
              className="rounded-lg border border-neutral-300 p-1.5 text-neutral-600 hover:bg-neutral-100"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-4 w-4"
                aria-hidden="true"
              >
                <path d="M21 12a9 9 0 1 1-2.64-6.36" />
                <path d="M21 3v6h-6" />
              </svg>
            </button>
            <button
              onClick={toggleSound}
              aria-label={soundOn ? "Silenciar timbre" : "Activar timbre"}
              aria-pressed={soundOn}
              title={
                soundOn
                  ? "Timbre activado: suena al entrar un pedido nuevo. Click para silenciar."
                  : "Timbre silenciado. Click para que suene al entrar un pedido nuevo."
              }
              className={
                "rounded-lg border px-2 py-1.5 text-base leading-none " +
                (soundOn
                  ? "border-brand-300 bg-brand-50"
                  : "border-neutral-300 hover:bg-neutral-100")
              }
            >
              <span aria-hidden="true">{soundOn ? "🔔" : "🔕"}</span>
            </button>
            <AdminNav />
            <LogoutButton />
          </div>
        </div>
      </header>

      {metrics && (
        <div className="border-b border-neutral-200 bg-brand-50/40">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-1 px-6 py-2 text-sm">
            <span className="text-xs font-semibold uppercase tracking-wide text-brand-700">
              Hoy
            </span>
            <Stat label="Pedidos" value={metrics.orders} />
            <Stat label="Facturado" value={formatCurrency(metrics.revenue)} />
            <Stat
              label="A cobrar (efvo/transf)"
              value={formatCurrency(metrics.cashPending)}
              accent={metrics.cashPending > 0}
            />
            <span className="text-neutral-400">
              Pend {metrics.byStatus.PENDING} · Conf {metrics.byStatus.CONFIRMED}{" "}
              · Prep {metrics.byStatus.IN_PROGRESS} · Listo{" "}
              {metrics.byStatus.READY} · Entreg {metrics.byStatus.DELIVERED}
              {metrics.byStatus.CANCELLED > 0 &&
                ` · Canc ${metrics.byStatus.CANCELLED}`}
            </span>
            <Link
              href="/admin/metricas"
              className="text-xs font-medium text-brand-600 hover:underline"
            >
              Ver historial →
            </Link>
          </div>
        </div>
      )}

      {storeStatus && (
        <div className="border-b border-neutral-200 bg-white">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-6 py-3 text-sm">
            <span className="font-medium text-neutral-500">Estado del local:</span>
            <StatusToggle
              label={storeStatus.storeOpen ? "Abierto" : "Cerrado"}
              on={storeStatus.storeOpen}
              busy={statusBusy === "storeOpen"}
              onToggle={() => toggleStoreFlag("storeOpen")}
            />
            <span className="mx-1 h-4 w-px bg-neutral-200" />
            <span className="font-medium text-neutral-500">Canales:</span>
            <StatusToggle
              label="Delivery"
              on={storeStatus.deliveryEnabled}
              busy={false}
              onToggle={() => setChannelsOpen(true)}
            />
            <StatusToggle
              label="Takeaway"
              on={storeStatus.pickupEnabled}
              busy={false}
              onToggle={() => setChannelsOpen(true)}
            />
            {prepTimes && (
              <button
                type="button"
                onClick={() => setChannelsOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-full border border-neutral-300 bg-white px-3 py-1 font-medium text-neutral-600 transition hover:bg-neutral-50"
                title="Demora: Delivery / Takeaway"
              >
                ⏱️ {prepTimes.delivery} / {prepTimes.pickup} min
              </button>
            )}
            {!storeStatus.storeOpen && (
              <span className="text-xs text-neutral-400">
                Con el local cerrado, el cliente ve el menú pero no puede pedir.
              </span>
            )}
          </div>
        </div>
      )}

      {channelsOpen && storeStatus && (
        <div
          className="fixed inset-0 z-30 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setChannelsOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-neutral-900">
              Canales de venta
            </h3>
            <p className="mt-1 text-sm text-neutral-500">
              Pausá un canal o ajustá la demora sin cerrar el local.
            </p>

            <div className="mt-4 flex flex-col gap-2">
              {(
                [
                  {
                    channel: "delivery",
                    field: "deliveryEnabled",
                    label: "Delivery",
                    desc: "Envío a domicilio",
                    on: storeStatus.deliveryEnabled,
                  },
                  {
                    channel: "pickup",
                    field: "pickupEnabled",
                    label: "Takeaway",
                    desc: "Retiro en el local",
                    on: storeStatus.pickupEnabled,
                  },
                ] as const
              ).map((c) => (
                <div
                  key={c.field}
                  className="rounded-lg border border-neutral-200 px-3 py-2"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-neutral-800">
                        {c.label}
                      </p>
                      <p className="text-xs text-neutral-400">{c.desc}</p>
                    </div>
                    <StatusToggle
                      label={c.on ? "Activo" : "Pausado"}
                      on={c.on}
                      busy={statusBusy === c.field}
                      disabled={!storeStatus.storeOpen}
                      onToggle={() => toggleStoreFlag(c.field)}
                    />
                  </div>
                  <label className="mt-2 flex items-center gap-2 border-t border-neutral-100 pt-2 text-xs text-neutral-500">
                    Demora
                    <input
                      type="number"
                      min={0}
                      max={240}
                      value={prepDrafts[c.channel]}
                      onChange={(e) =>
                        setPrepDrafts((d) => ({
                          ...d,
                          [c.channel]: e.target.value,
                        }))
                      }
                      onBlur={() => savePrepTime(c.channel)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") e.currentTarget.blur();
                      }}
                      className="w-16 rounded-md border border-neutral-300 px-2 py-1 text-sm"
                    />
                    min
                  </label>
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-neutral-400">
              La demora se muestra en el checkout y en el seguimiento del cliente.
            </p>

            {!storeStatus.storeOpen && (
              <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                El local está cerrado: ningún canal toma pedidos. Reabrilo con el
                botón &ldquo;Cerrado&rdquo; de la barra.
              </p>
            )}

            <button
              type="button"
              onClick={() => setChannelsOpen(false)}
              className="mt-6 w-full rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
            >
              Listo
            </button>
          </div>
        </div>
      )}

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
                          storeName={storeName}
                          drivers={drivers}
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

      <button
        onClick={() => setNewOrderOpen(true)}
        title="Cargar un pedido a mano (cliente en el local o por teléfono)"
        className="fixed bottom-6 right-6 z-20 flex h-14 w-14 items-center justify-center rounded-full bg-brand-600 text-3xl font-light text-white shadow-lg transition hover:bg-brand-700"
        aria-label="Nuevo pedido"
      >
        +
      </button>

      {newOrderOpen && (
        <NewOrderModal
          onClose={() => setNewOrderOpen(false)}
          onCreated={() => {
            suppressPollUntil.current = 0;
            load();
            loadMetrics();
          }}
        />
      )}

      {rejectTarget && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="font-semibold text-neutral-900">
              Cancelar pedido #{rejectTarget.number}
            </h3>
            <p className="mt-1 text-sm text-neutral-500">
              {rejectTarget.customerFirstName} {rejectTarget.customerLastName}. El
              cliente lo verá como cancelado.
            </p>
            <label className="mt-3 block text-xs font-medium text-neutral-600">
              Motivo de la cancelación (obligatorio)
            </label>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
              autoFocus
              placeholder="Ej: el cliente se arrepintió, sin stock, dirección fuera de zona…"
              className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRejectTarget(null)}
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-neutral-500 hover:bg-neutral-100"
              >
                Volver
              </button>
              <button
                type="button"
                onClick={confirmReject}
                disabled={rejectReason.trim().length < 3}
                className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Cancelar pedido
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function OrderCard({
  order,
  storeName,
  drivers,
  now,
  busy,
  onMutate,
  onReject,
}: {
  order: OrderDTO;
  storeName: string;
  drivers: DriverDTO[];
  now: number;
  busy: boolean;
  onMutate: (id: string, body: OrderPatch) => void;
  onReject: (order: OrderDTO) => void;
}) {
  const canWhatsApp = normalizeArPhone(order.customerPhone) !== null;
  const [menuOpen, setMenuOpen] = useState(false);

  function openWhatsApp() {
    const trackUrl = `${window.location.origin}/pedido/${order.id}`;
    const link = whatsappLink(
      order.customerPhone,
      whatsappMessage(order, storeName, trackUrl)
    );
    if (link) window.open(link, "_blank", "noopener,noreferrer");
  }

  function openDriverWhatsApp() {
    if (!order.driver) return;
    const link = whatsappLink(
      order.driver.phone,
      buildDriverMessage(order, storeName)
    );
    if (link) window.open(link, "_blank", "noopener,noreferrer");
  }

  const isDelivery = order.orderType === "DELIVERY";
  const activeDrivers = drivers.filter((d) => d.active);
  // Si el repartidor asignado está inactivo, igual hay que mostrarlo en el select.
  const driverOptions =
    order.driver && !activeDrivers.some((d) => d.id === order.driver!.id)
      ? [
          ...activeDrivers,
          { id: order.driver.id, name: `${order.driver.name} (inactivo)` },
        ]
      : activeDrivers;
  const driverPhoneOk =
    !!order.driver && normalizeArPhone(order.driver.phone) !== null;

  const isStalePending =
    order.status === "PENDING" &&
    now - new Date(order.createdAt).getTime() > STALE_PENDING_MS;

  const paid = order.payment?.status === "CONFIRMED";
  const canMarkPaid =
    !!order.payment &&
    !paid &&
    (order.payment.provider === "CASH" ||
      order.payment.provider === "BANK_TRANSFER");

  // Acción primaria de la tarjeta según el estado (para PENDING el par
  // Aceptar/Rechazar se renderiza aparte).
  const primaryAction:
    | { label: string; to: OrderStatus; cls: string }
    | null =
    order.status === "CONFIRMED"
      ? {
          label: "Empezar preparación",
          to: "IN_PROGRESS",
          cls: "bg-brand-600 hover:bg-brand-700",
        }
      : order.status === "IN_PROGRESS"
        ? {
            label: "Marcar listo",
            to: "READY",
            cls: "bg-brand-600 hover:bg-brand-700",
          }
        : order.status === "READY"
          ? {
              label: isDelivery ? "Enviado" : "Entregado",
              to: "DELIVERED",
              cls: "bg-green-600 hover:bg-green-700",
            }
          : null;

  return (
    <article
      className={
        "rounded-xl border bg-white p-3 shadow-sm " +
        (isStalePending
          ? "border-amber-400 ring-1 ring-amber-300"
          : "border-neutral-200")
      }
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium leading-tight text-neutral-900">
            <span className="mr-1 text-neutral-400">#{order.number}</span>
            {order.customerFirstName} {order.customerLastName}
          </p>
          <p className="text-xs text-neutral-500">{order.customerPhone}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <span className="whitespace-nowrap text-xs text-neutral-400">
            {relativeTime(order.createdAt, now)}
          </span>
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="rounded-md px-1.5 py-0.5 text-lg leading-none text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
              aria-label="Más acciones"
            >
              ⋯
            </button>
            {menuOpen && (
              <>
                <button
                  type="button"
                  tabIndex={-1}
                  aria-hidden="true"
                  className="fixed inset-0 z-10 cursor-default"
                  onClick={() => setMenuOpen(false)}
                />
                <div className="absolute right-0 z-20 mt-1 w-56 rounded-lg border border-neutral-200 bg-white p-2 text-sm shadow-lg">
                  <label className="block text-xs text-neutral-500">
                    Demora de preparación
                    <select
                      value={order.extraDelayMinutes}
                      disabled={busy}
                      onChange={(e) =>
                        onMutate(order.id, {
                          extraDelayMinutes: Number(e.target.value),
                        })
                      }
                      className="mt-1 w-full rounded-md border border-neutral-300 px-2 py-1 text-sm disabled:opacity-50"
                    >
                      {DELAY_OPTIONS.map((m) => (
                        <option key={m} value={m}>
                          {m === 0 ? "sin demora" : `+${m} min`}
                        </option>
                      ))}
                      {!DELAY_OPTIONS.includes(order.extraDelayMinutes) && (
                        <option value={order.extraDelayMinutes}>
                          +{order.extraDelayMinutes} min
                        </option>
                      )}
                    </select>
                  </label>

                  {isDelivery && order.driver && (
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        openDriverWhatsApp();
                      }}
                      disabled={!driverPhoneOk}
                      className="mt-2 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <WhatsAppIcon className="h-4 w-4 text-[#25D366]" />
                      WhatsApp al repartidor
                    </button>
                  )}

                  {order.status !== "PENDING" && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setMenuOpen(false);
                        onReject(order);
                      }}
                      className="mt-1 flex w-full items-center rounded-md px-2 py-1.5 text-left text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      Cancelar pedido
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <span className="rounded bg-brand-50 px-1.5 py-0.5 text-xs font-medium text-brand-700">
          {isDelivery ? "Envío" : "Retiro"}
        </span>
        {order.extraDelayMinutes > 0 && (
          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-700">
            +{order.extraDelayMinutes} min
          </span>
        )}
        {order.deliveryAddress && (
          <span className="text-xs text-neutral-600">
            {order.deliveryAddress}
          </span>
        )}
      </div>

      <ul className="mt-2 flex flex-col gap-0.5 border-t border-neutral-100 pt-2 text-sm leading-snug text-neutral-700">
        {order.items.map((item) => (
          <li key={item.id}>
            <span className="font-medium">{item.quantity}×</span>{" "}
            {item.productName}
            {item.options.length > 0 && (
              <span className="text-xs text-neutral-500">
                {" · "}
                {item.options.map((o) => o.name).join(", ")}
              </span>
            )}
            {item.notes && (
              <span className="text-xs italic text-neutral-500">
                {" · “"}
                {item.notes}”
              </span>
            )}
          </li>
        ))}
      </ul>

      {order.notes && (
        <p className="mt-2 rounded-md bg-amber-50 px-2 py-1 text-xs italic text-amber-800">
          Nota: {order.notes}
        </p>
      )}

      <div className="mt-2 flex items-center justify-between gap-2 text-sm">
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
          <p className="mt-1 text-xs text-neutral-500">
            Paga con {formatCurrency(order.payment.changeFor)} · vuelto{" "}
            {formatCurrency(Math.max(0, order.payment.changeFor - order.total))}
          </p>
        )}

      {isDelivery &&
        (activeDrivers.length === 0 && !order.driver ? (
          <p className="mt-2 text-xs text-neutral-400">
            Cargá repartidores en{" "}
            <Link href="/admin/repartidores" className="underline">
              Admin → Repartidores
            </Link>
            .
          </p>
        ) : (
          <label className="mt-2 flex items-center gap-2 text-xs text-neutral-500">
            <span className="shrink-0">Repartidor</span>
            <select
              value={order.driverId ?? ""}
              disabled={busy}
              onChange={(e) =>
                onMutate(order.id, { driverId: e.target.value || null })
              }
              className="w-full rounded-md border border-neutral-300 bg-white px-2 py-1 text-sm disabled:opacity-50"
            >
              <option value="">— Sin asignar —</option>
              {driverOptions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
        ))}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={openWhatsApp}
          disabled={!canWhatsApp}
          title={
            canWhatsApp
              ? "Abrir WhatsApp con un mensaje listo para el cliente"
              : "El teléfono del cliente no sirve para WhatsApp"
          }
          className="flex shrink-0 items-center justify-center rounded-lg bg-[#25D366] px-2.5 py-1.5 text-white hover:bg-[#1ebe5b] disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Enviar WhatsApp al cliente"
        >
          <WhatsAppIcon className="h-4 w-4" />
        </button>

        {order.status === "PENDING" ? (
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
        ) : (
          primaryAction && (
            <button
              disabled={busy}
              onClick={() => onMutate(order.id, { status: primaryAction.to })}
              className={
                "flex-1 rounded-lg px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 " +
                primaryAction.cls
              }
            >
              {primaryAction.label}
            </button>
          )
        )}

        {canMarkPaid && (
          <button
            disabled={busy}
            onClick={() => onMutate(order.id, { markPaid: true })}
            className="shrink-0 rounded-lg border border-green-400 px-3 py-1.5 text-sm font-medium text-green-700 hover:bg-green-50 disabled:opacity-50"
          >
            Cobrar
          </button>
        )}
      </div>
    </article>
  );
}
