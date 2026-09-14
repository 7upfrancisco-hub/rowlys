"use client";

import { formatCurrency } from "@/types";

// Gráfico de línea "a mano" (SVG, sin librería) para ventas por día de un
// mes. Extraído de /admin/metricas (Fase 14) para reusarlo también en
// /blend-admin (Fase 27) — es genérico: solo necesita el array diario.

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

export interface DailyPoint {
  day: number;
  orders: number;
  revenue: number;
}

export default function DailyRevenueChart({
  daily,
  month,
  todayDay,
  title = "Ventas por día",
  color = "#f97316",
  emptyLabel = "Sin ventas facturables este mes.",
}: {
  daily: DailyPoint[];
  month: string;
  todayDay: number | null;
  title?: string;
  color?: string;
  emptyLabel?: string;
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
        <h3 className="font-semibold text-neutral-800">{title}</h3>
        <span className="text-xs text-neutral-400">
          {formatCurrency(totalRevenue)} · {totalOrders} pedido
          {totalOrders === 1 ? "" : "s"}
        </span>
      </div>
      {totalRevenue === 0 ? (
        <p className="py-10 text-center text-sm text-neutral-400">
          {emptyLabel}
        </p>
      ) : (
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full"
          role="img"
          aria-label={title}
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

          {areaPath && <path d={areaPath} fill={color} fillOpacity={0.08} />}
          <path
            d={linePath}
            fill="none"
            stroke={color}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
          {coords.map(([px, py], i) => (
            <circle key={i} cx={px} cy={py} r={3} fill={color}>
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
