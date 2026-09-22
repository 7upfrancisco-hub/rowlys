"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api-client";

type ReportResult = {
  typeLabel: string;
  columns: string[];
  rows: (string | number)[][];
  numericCols: number[];
  summary: string[];
};

// Grupos y tipos disponibles (coinciden con REPORT_TYPES de cada endpoint
// backend). Cada tipo sabe a qué ruta pegarle — así el selector puede mezclar
// reportes de distintas familias (Ventas, Clientes, ...) sin que el
// componente tenga que saber nada de ellas. Faltan Productos, Cancelaciones
// y Descuentos — se suman en fases siguientes.
const REPORTS_ENDPOINT = "/api/admin/reports/ventas";
const CLIENTS_ENDPOINT = "/api/admin/reports/clientes";
const PRODUCTS_ENDPOINT = "/api/admin/reports/productos";
const CANCEL_ENDPOINT = "/api/admin/reports/cancelaciones";
const DISCOUNTS_ENDPOINT = "/api/admin/reports/descuentos";

// `value` identifica la opción en el <select> (tiene que ser único en TODO
// el desplegable, cruzando grupos). `apiType`, si es distinto, es lo que
// realmente se manda como ?type= al backend — hace falta cuando dos grupos
// usan la misma clave de tipo puertas adentro (ej. "day"/"month" en Ventas y
// en Cancelaciones).
const GROUPS: {
  label: string;
  types: { value: string; label: string; endpoint: string; apiType?: string }[];
}[] = [
  {
    label: "Ventas",
    types: [
      { value: "day", label: "Ventas por día", endpoint: REPORTS_ENDPOINT },
      { value: "day_channel", label: "Ventas por día, canal", endpoint: REPORTS_ENDPOINT },
      { value: "day_payment", label: "Ventas por día, método de pago", endpoint: REPORTS_ENDPOINT },
      {
        value: "day_channel_payment",
        label: "Ventas por día, canal y método de pago",
        endpoint: REPORTS_ENDPOINT,
      },
      { value: "day_driver", label: "Ventas por día, repartidor", endpoint: REPORTS_ENDPOINT },
      { value: "month", label: "Ventas por mes", endpoint: REPORTS_ENDPOINT },
      { value: "month_channel", label: "Ventas por mes, canal", endpoint: REPORTS_ENDPOINT },
      { value: "month_payment", label: "Ventas por mes, método de pago", endpoint: REPORTS_ENDPOINT },
      {
        value: "month_channel_payment",
        label: "Ventas por mes, canal y método de pago",
        endpoint: REPORTS_ENDPOINT,
      },
      { value: "month_driver", label: "Ventas por mes, repartidor", endpoint: REPORTS_ENDPOINT },
      { value: "category", label: "Ventas por categoría", endpoint: REPORTS_ENDPOINT },
    ],
  },
  {
    label: "Clientes",
    types: [
      { value: "top_revenue", label: "Clientes por ventas (top 50)", endpoint: CLIENTS_ENDPOINT },
      { value: "top_orders", label: "Clientes por pedidos (top 50)", endpoint: CLIENTS_ENDPOINT },
    ],
  },
  {
    label: "Productos",
    types: [
      { value: "by_product", label: "Ventas por producto", endpoint: PRODUCTS_ENDPOINT },
      {
        value: "by_category_product",
        label: "Ventas por categoría, producto",
        endpoint: PRODUCTS_ENDPOINT,
      },
    ],
  },
  {
    label: "Cancelaciones",
    types: [
      {
        value: "cancel_day",
        label: "Cancelaciones por día",
        endpoint: CANCEL_ENDPOINT,
        apiType: "day",
      },
      {
        value: "cancel_month",
        label: "Cancelaciones por mes",
        endpoint: CANCEL_ENDPOINT,
        apiType: "month",
      },
    ],
  },
  {
    label: "Descuentos",
    types: [
      { value: "cupones", label: "Cupones usados", endpoint: DISCOUNTS_ENDPOINT },
      { value: "automaticos", label: "Descuentos automáticos", endpoint: DISCOUNTS_ENDPOINT },
    ],
  },
];

const TYPE_BY_VALUE = new Map(
  GROUPS.flatMap((g) => g.types).map((t) => [t.value, t])
);

type RangePreset = "today" | "yesterday" | "week" | "month" | "last_month" | "year" | "custom";

const PRESETS: { value: RangePreset; label: string }[] = [
  { value: "today", label: "Hoy" },
  { value: "yesterday", label: "Ayer" },
  { value: "week", label: "Últimos 7 días" },
  { value: "month", label: "Este mes" },
  { value: "last_month", label: "Mes anterior" },
  { value: "year", label: "Este año" },
  { value: "custom", label: "Personalizado" },
];

// Fecha de hoy en horario de Argentina, como YYYY-MM-DD.
function arToday(): { y: number; m: number; d: number } {
  const s = new Date(Date.now() - 3 * 60 * 60 * 1000);
  return { y: s.getUTCFullYear(), m: s.getUTCMonth(), d: s.getUTCDate() };
}

function toISO(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function rangeFor(preset: RangePreset): { from: string; to: string } {
  const t = arToday();
  const todayIso = toISO(t.y, t.m, t.d);
  switch (preset) {
    case "today":
      return { from: todayIso, to: todayIso };
    case "yesterday": {
      const d = new Date(Date.UTC(t.y, t.m, t.d - 1));
      const iso = toISO(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
      return { from: iso, to: iso };
    }
    case "week": {
      const d = new Date(Date.UTC(t.y, t.m, t.d - 6));
      return { from: toISO(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()), to: todayIso };
    }
    case "last_month": {
      const first = new Date(Date.UTC(t.y, t.m - 1, 1));
      const last = new Date(Date.UTC(t.y, t.m, 0));
      return {
        from: toISO(first.getUTCFullYear(), first.getUTCMonth(), first.getUTCDate()),
        to: toISO(last.getUTCFullYear(), last.getUTCMonth(), last.getUTCDate()),
      };
    }
    case "year":
      return { from: toISO(t.y, 0, 1), to: todayIso };
    case "month":
    default:
      return { from: toISO(t.y, t.m, 1), to: todayIso };
  }
}

export default function ReportesTab() {
  const [type, setType] = useState("day");
  const [preset, setPreset] = useState<RangePreset>("month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [result, setResult] = useState<ReportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const range = useMemo(() => {
    if (preset === "custom") return { from: customFrom, to: customTo };
    return rangeFor(preset);
  }, [preset, customFrom, customTo]);

  function generate() {
    if (preset === "custom" && (!customFrom || !customTo)) {
      setError("Elegí las dos fechas del rango personalizado.");
      return;
    }
    setError(null);
    setLoading(true);
    const picked = TYPE_BY_VALUE.get(type);
    const endpoint = picked?.endpoint ?? REPORTS_ENDPOINT;
    const apiType = picked?.apiType ?? type;
    apiFetch<ReportResult>(
      `${endpoint}?type=${apiType}&from=${range.from}&to=${range.to}`
    )
      .then(setResult)
      .catch((err: ApiError) => {
        setError(err.message);
        setResult(null);
      })
      .finally(() => setLoading(false));
  }

  // Al cambiar de tipo de reporte, se limpia el resultado y el error
  // anteriores para no mostrar una tabla o un error viejo que ya no
  // corresponde al reporte recién elegido.
  useEffect(() => {
    setResult(null);
    setError(null);
  }, [type]);

  async function exportPdf() {
    if (!result) return;
    setPdfLoading(true);
    try {
      const { downloadPdfReport } = await import("@/lib/pdf-report");
      downloadPdfReport({
        filename: `blend-reporte-${type}-${range.from}_${range.to}.pdf`,
        title: `Blend · ${result.typeLabel}`,
        subtitle: `${range.from} a ${range.to}`,
        summary: result.summary,
        columns: result.columns,
        rows: result.rows,
        numericCols: result.numericCols,
      });
    } finally {
      setPdfLoading(false);
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-semibold text-neutral-700">
            Tipo de reporte <span className="text-red-600">*</span>
          </span>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="min-w-[18rem] rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
          >
            {GROUPS.map((g) => (
              <optgroup key={g.label} label={g.label}>
                {g.types.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-semibold text-neutral-700">
            Dimensión temporal <span className="text-red-600">*</span>
          </span>
          <select
            value={preset}
            onChange={(e) => setPreset(e.target.value as RangePreset)}
            className="rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
          >
            {PRESETS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </label>

        {preset === "custom" && (
          <>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-semibold text-neutral-700">Desde</span>
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-semibold text-neutral-700">Hasta</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
              />
            </label>
          </>
        )}

        <button
          type="button"
          onClick={generate}
          disabled={loading}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Generando…" : "Generar"}
        </button>
      </div>

      {error && (
        <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {!result && !error && (
        <p className="rounded-lg border border-dashed border-neutral-300 bg-neutral-50 px-4 py-6 text-sm text-neutral-500">
          Elegí un tipo de reporte y tocá &ldquo;Generar&rdquo;.
        </p>
      )}

      {result && (
        <div>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-lg font-bold text-navy-900">{result.typeLabel}</h3>
            <button
              type="button"
              onClick={exportPdf}
              disabled={pdfLoading}
              className="rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm font-semibold text-neutral-600 transition hover:border-brand-300 hover:text-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pdfLoading ? "Generando…" : "Exportar PDF"}
            </button>
          </div>

          <div className="mb-4 flex flex-wrap gap-4 text-sm text-neutral-600">
            {result.summary.map((s) => (
              <span key={s} className="font-semibold text-navy-900">
                {s}
              </span>
            ))}
          </div>

          {result.rows.length === 0 ? (
            <p className="rounded-lg border border-dashed border-neutral-300 bg-neutral-50 px-4 py-6 text-sm text-neutral-500">
              No hay datos para este rango.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-neutral-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-neutral-50 text-left text-neutral-500">
                    {result.columns.map((c, i) => (
                      <th
                        key={c}
                        className={
                          "px-3 py-2 font-semibold " +
                          (result.numericCols.includes(i) ? "text-right" : "text-left")
                        }
                      >
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((r, i) => (
                    <tr key={i} className="border-t border-neutral-100">
                      {r.map((cell, j) => (
                        <td
                          key={j}
                          className={
                            "px-3 py-2 " +
                            (result.numericCols.includes(j)
                              ? "text-right tabular-nums"
                              : "text-left")
                          }
                        >
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
