"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api-client";
import {
  formatCurrency,
  ORDER_TYPE_LABELS,
  PAYMENT_PROVIDER_LABELS,
  type OrderType,
  type PaymentProvider,
} from "@/types";

type Pair = { orders: number; revenue: number };

type HistoryRow = {
  month: string;
  label: string;
  orders: number;
  revenue: number;
  cancelled: number;
  avgTicket: number;
};

type MetricsHistory = {
  month: string;
  monthLabel: string;
  isCurrentMonth: boolean;
  todayDay: number | null;
  currentMonth: string;
  summary: {
    billableOrders: number;
    revenue: number;
    avgTicket: number;
    cancelled: number;
    pending: number;
  };
  daily: { day: number; orders: number; revenue: number }[];
  byChannel: Record<OrderType, Pair>;
  byPayment: Record<PaymentProvider, Pair>;
  monthlyHistory: HistoryRow[];
};

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default function MetricasClient() {
  const [data, setData] = useState<MetricsHistory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback((month: string | null) => {
    setLoading(true);
    setError(null);
    const qs = month ? `?month=${month}` : "";
    apiFetch<MetricsHistory>(`/api/admin/metrics/history${qs}`)
      .then(setData)
      .catch((err: ApiError) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load(null);
  }, [load]);

  const atCurrent = data ? data.month >= data.currentMonth : true;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-2xl font-bold text-neutral-900">
          Métricas e historial
        </h2>
        {data && (
          <div className="flex items-center gap-1">
            <NavBtn label="‹" onClick={() => load(shiftMonth(data.month, -1))} />
            <span className="min-w-[10rem] text-center font-semibold capitalize text-neutral-800">
              {data.monthLabel}
            </span>
            <NavBtn
              label="›"
              disabled={atCurrent}
              onClick={() => load(shiftMonth(data.month, 1))}
            />
          </div>
        )}
      </div>

      {error && (
        <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {!data && loading && (
        <p className="text-sm text-neutral-400">Cargando métricas…</p>
      )}

      {data && (
        <div className={"space-y-4 " + (loading ? "opacity-60" : "")}>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Card
              label="Pedidos facturables"
              value={data.summary.billableOrders}
              hint={data.isCurrentMonth ? "mes en curso" : undefined}
              big
            />
            <Card
              label="Facturado"
              value={formatCurrency(data.summary.revenue)}
            />
            <Card
              label="Ticket promedio"
              value={formatCurrency(data.summary.avgTicket)}
            />
            <Card
              label="Cancelados"
              value={data.summary.cancelled}
              sub={`${data.summary.pending} sin aceptar`}
            />
          </div>

          <DailyChart
            daily={data.daily}
            month={data.month}
            todayDay={data.todayDay}
          />

          <div className="grid gap-4 lg:grid-cols-2">
            <Breakdown
              title="Por canal"
              rows={[
                {
                  label: ORDER_TYPE_LABELS.DELIVERY,
                  pair: data.byChannel.DELIVERY,
                },
                { label: ORDER_TYPE_LABELS.PICKUP, pair: data.byChannel.PICKUP },
              ]}
            />
            <Breakdown
              title="Por medio de pago"
              rows={(
                Object.keys(PAYMENT_PROVIDER_LABELS) as PaymentProvider[]
              )
                .map((p) => ({
                  label: PAYMENT_PROVIDER_LABELS[p],
                  pair: data.byPayment[p],
                }))
                .filter((r) => r.pair.orders > 0)}
            />
          </div>

          <MonthlyTable
            rows={data.monthlyHistory}
            selected={data.month}
            onPick={load}
          />

          <p className="text-xs text-neutral-400">
            &ldquo;Pedidos facturables&rdquo; = pedidos que el local aceptó
            (confirmados, en preparación, listos o entregados). No cuenta los
            pendientes sin aceptar ni los cancelados. Horario de Argentina.
          </p>
        </div>
      )}
    </div>
  );
}

function NavBtn({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm font-semibold text-neutral-600 transition hover:border-brand-300 hover:text-brand-700 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {label}
    </button>
  );
}

function Card({
  label,
  value,
  sub,
  hint,
  big,
}: {
  label: string;
  value: string | number;
  sub?: string;
  hint?: string;
  big?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      <p className="text-xs uppercase tracking-wide text-neutral-400">{label}</p>
      <p
        className={
          "mt-1 font-bold text-neutral-900 " + (big ? "text-3xl" : "text-2xl")
        }
      >
        {value}
      </p>
      {sub && <p className="mt-0.5 text-xs text-neutral-500">{sub}</p>}
      {hint && <p className="mt-0.5 text-xs font-medium text-brand-600">{hint}</p>}
    </div>
  );
}

// Curva suave (Catmull-Rom -> bézier cúbica) que pasa por todos los puntos.
function smoothPath(pts: [number, number][]): string {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M ${pts[0][0]} ${pts[0][1]}`;
  const t = 0.18; // tensión
  const d = [`M ${pts[0][0]} ${pts[0][1]}`];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1[0] + (p2[0] - p0[0]) * t;
    const c1y = p1[1] + (p2[1] - p0[1]) * t;
    const c2x = p2[0] - (p3[0] - p1[0]) * t;
    const c2y = p2[1] - (p3[1] - p1[1]) * t;
    d.push(`C ${c1x} ${c1y} ${c2x} ${c2y} ${p2[0]} ${p2[1]}`);
  }
  return d.join(" ");
}

// ~6 días repartidos parejo a lo largo del mes, siempre con el 1 y el último.
function axisDays(last: number): number[] {
  const count = Math.min(6, last);
  if (count <= 1) return [1];
  const step = (last - 1) / (count - 1);
  return Array.from(
    new Set(Array.from({ length: count }, (_, i) => Math.round(1 + i * step)))
  );
}

function DailyChart({
  daily,
  month,
  todayDay,
}: {
  daily: { day: number; orders: number; revenue: number }[];
  month: string;
  todayDay: number | null;
}) {
  const mm = month.split("-")[1];
  const lastDay = daily.length;
  // En el mes en curso, dibujar solo hasta hoy (los días futuros son 0).
  const points = todayDay ? daily.filter((d) => d.day <= todayDay) : daily;
  const totalRevenue = points.reduce((s, d) => s + d.revenue, 0);
  const totalOrders = points.reduce((s, d) => s + d.orders, 0);
  const maxRevenue = Math.max(1, ...points.map((d) => d.revenue));

  const W = 780;
  const H = 280;
  const padL = 62;
  const padR = 14;
  const padT = 14;
  const padB = 26;
  const x = (day: number) =>
    padL + ((day - 1) / Math.max(1, lastDay - 1)) * (W - padL - padR);
  const y = (rev: number) =>
    padT + (1 - rev / maxRevenue) * (H - padT - padB);

  const coords = points.map((d) => [x(d.day), y(d.revenue)] as [number, number]);
  const linePath = smoothPath(coords);
  const areaPath =
    coords.length > 1
      ? `${linePath} L ${coords[coords.length - 1][0]} ${H - padB} L ${
          coords[0][0]
        } ${H - padB} Z`
      : "";

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * maxRevenue);
  const xLabels = axisDays(lastDay);

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="font-semibold text-neutral-800">Ventas por día</h3>
        <span className="text-xs text-neutral-400">
          {formatCurrency(totalRevenue)} · {totalOrders} pedido
          {totalOrders === 1 ? "" : "s"}
        </span>
      </div>
      {totalRevenue === 0 ? (
        <p className="py-10 text-center text-sm text-neutral-400">
          Sin ventas facturables este mes.
        </p>
      ) : (
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full"
          role="img"
          aria-label="Ventas por día del mes"
        >
          {yTicks.map((v, i) => (
            <g key={i}>
              <line
                x1={padL}
                x2={W - padR}
                y1={y(v)}
                y2={y(v)}
                stroke="#e5e5e5"
                strokeWidth={1}
              />
              <text
                x={padL - 8}
                y={y(v) + 3}
                textAnchor="end"
                fontSize={10}
                fill="#a3a3a3"
              >
                {formatCurrency(v)}
              </text>
            </g>
          ))}

          {xLabels.map((day) => (
            <text
              key={day}
              x={x(day)}
              y={H - padB + 16}
              textAnchor="middle"
              fontSize={10}
              fill="#a3a3a3"
            >
              {String(day).padStart(2, "0")}/{mm}
            </text>
          ))}

          {areaPath && <path d={areaPath} fill="#f97316" fillOpacity={0.08} />}
          <path
            d={linePath}
            fill="none"
            stroke="#f97316"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
          {coords.map(([px, py], i) => (
            <circle key={i} cx={px} cy={py} r={3} fill="#f97316">
              <title>
                {String(points[i].day).padStart(2, "0")}/{mm}:{" "}
                {formatCurrency(points[i].revenue)} · {points[i].orders} pedido
                {points[i].orders === 1 ? "" : "s"}
              </title>
            </circle>
          ))}
        </svg>
      )}
    </section>
  );
}

function Breakdown({
  title,
  rows,
}: {
  title: string;
  rows: { label: string; pair: Pair }[];
}) {
  const total = rows.reduce((s, r) => s + r.pair.orders, 0);
  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      <h3 className="mb-3 font-semibold text-neutral-800">{title}</h3>
      {total === 0 ? (
        <p className="text-sm text-neutral-400">
          Sin pedidos facturables este mes.
        </p>
      ) : (
        <ul className="space-y-2.5">
          {rows.map((r) => {
            const pct = Math.round((r.pair.orders / total) * 100);
            return (
              <li key={r.label}>
                <div className="flex items-baseline justify-between text-sm">
                  <span className="text-neutral-700">{r.label}</span>
                  <span className="text-neutral-500">
                    {r.pair.orders} · {formatCurrency(r.pair.revenue)}{" "}
                    <span className="text-neutral-400">({pct}%)</span>
                  </span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded bg-neutral-100">
                  <div
                    className="h-full rounded bg-brand-400"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function MonthlyTable({
  rows,
  selected,
  onPick,
}: {
  rows: HistoryRow[];
  selected: string;
  onPick: (month: string) => void;
}) {
  return (
    <section className="rounded-2xl border border-neutral-200 bg-white shadow-sm">
      <div className="border-b border-neutral-200 px-5 py-3">
        <h3 className="font-semibold text-neutral-800">Historial mensual</h3>
        <p className="text-xs text-neutral-400">
          Desde el primer pedido del negocio. Clic en un mes para ver su detalle.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-neutral-400">
              <th className="px-5 py-2 font-medium">Mes</th>
              <th className="px-5 py-2 text-right font-medium">Pedidos</th>
              <th className="px-5 py-2 text-right font-medium">Facturado</th>
              <th className="px-5 py-2 text-right font-medium">Ticket prom.</th>
              <th className="px-5 py-2 text-right font-medium">Cancelados</th>
            </tr>
          </thead>
          <tbody>
            {[...rows].reverse().map((r) => (
              <tr
                key={r.month}
                onClick={() => onPick(r.month)}
                className={
                  "cursor-pointer border-t border-neutral-100 transition hover:bg-brand-50 " +
                  (r.month === selected ? "bg-brand-50 font-semibold" : "")
                }
              >
                <td className="px-5 py-2 capitalize text-neutral-700">
                  {r.label}
                </td>
                <td className="px-5 py-2 text-right text-neutral-900">
                  {r.orders}
                </td>
                <td className="px-5 py-2 text-right text-neutral-700">
                  {formatCurrency(r.revenue)}
                </td>
                <td className="px-5 py-2 text-right text-neutral-500">
                  {formatCurrency(r.avgTicket)}
                </td>
                <td className="px-5 py-2 text-right text-neutral-400">
                  {r.cancelled || "–"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
