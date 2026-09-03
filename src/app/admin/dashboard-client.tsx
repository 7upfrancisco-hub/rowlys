"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api-client";
import { formatCurrency } from "@/types";

type Metrics = {
  orders: number;
  revenue: number;
};

type Settings = {
  storeName: string;
  storeOpen: boolean;
  deliveryEnabled: boolean;
  pickupEnabled: boolean;
};

const GROUPS = [
  {
    title: "Pedidos",
    links: [
      {
        href: "/comanda",
        label: "Comanda",
        desc: "Tablero de cocina en vivo",
      },
      {
        href: "/admin/pedidos?ver=todos",
        label: "Finalizados",
        desc: "Entregados, cancelados e historial",
      },
    ],
  },
  {
    title: "Mi menú",
    links: [
      {
        href: "/admin/categorias",
        label: "Categorías",
        desc: "Secciones de la carta y su orden",
      },
      {
        href: "/admin/productos",
        label: "Productos",
        desc: "Precios, descuentos, canal y stock",
      },
      {
        href: "/admin/adicionales",
        label: "Adicionales",
        desc: "Guarniciones, salsas, quitar ingredientes",
      },
    ],
  },
  {
    title: "Métricas",
    links: [
      {
        href: "/admin/metricas",
        label: "Métricas e historial",
        desc: "Ventas por día, categoría y mes",
      },
    ],
  },
  {
    title: "Configuración",
    links: [
      {
        href: "/admin/repartidores",
        label: "Repartidores",
        desc: "Perfiles para asignar a los envíos",
      },
      {
        href: "/admin/configuracion",
        label: "Datos del local",
        desc: "Envío, alias bancario, horarios",
      },
    ],
  },
];

export default function DashboardClient() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  // Facturado del mes en curso, del mismo endpoint que usa /admin/metricas
  // (pedidos aceptados). Solo se muestra acá; no cambia esa pantalla.
  const [monthRevenue, setMonthRevenue] = useState<number | null>(null);

  useEffect(() => {
    function load() {
      apiFetch<Metrics>("/api/admin/metrics").then(setMetrics).catch(() => {});
      apiFetch<Settings>("/api/settings").then(setSettings).catch(() => {});
      apiFetch<{ summary: { revenue: number } }>("/api/admin/metrics/history")
        .then((h) => setMonthRevenue(h.summary.revenue))
        .catch(() => {});
    }
    load();
    const id = setInterval(load, 60000);
    return () => clearInterval(id);
  }, []);

  const today = new Date().toLocaleDateString("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "America/Argentina/Buenos_Aires",
  });

  // Ticket medio de hoy = facturado de hoy / pedidos de hoy.
  const avgToday =
    metrics && metrics.orders > 0
      ? Math.round(metrics.revenue / metrics.orders)
      : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-neutral-900">
            {settings?.storeName ?? "Panel"}
          </h2>
          <p className="text-sm capitalize text-neutral-500">{today}</p>
        </div>
        <Link
          href="/comanda"
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700"
        >
          Abrir comanda
        </Link>
      </div>

      {settings && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Chip
            on={settings.storeOpen}
            label={settings.storeOpen ? "Local abierto" : "Local cerrado"}
          />
          <Chip on={settings.deliveryEnabled} label="Delivery" />
          <Chip on={settings.pickupEnabled} label="Takeaway" />
          <span className="text-neutral-400">· se cambia desde la comanda</span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Pedidos hoy" value={metrics ? metrics.orders : "—"} />
        <Kpi
          label="Facturado hoy"
          value={metrics ? formatCurrency(metrics.revenue) : "—"}
        />
        <Kpi
          label="Ticket medio hoy"
          value={metrics ? formatCurrency(avgToday) : "—"}
        />
        <Kpi
          label="Facturado mes"
          value={monthRevenue !== null ? formatCurrency(monthRevenue) : "—"}
        />
      </div>

      <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
        {GROUPS.map((group) => (
          <section key={group.title}>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-400">
              {group.title}
            </h3>
            <ul>
              {group.links.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="-mx-3 block rounded-lg px-3 py-2 transition hover:bg-white hover:shadow-sm"
                  >
                    <span className="text-sm font-medium text-neutral-800">
                      {link.label}
                    </span>
                    <span className="block text-xs text-neutral-400">
                      {link.desc}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      <p className="text-xs uppercase tracking-wide text-neutral-400">{label}</p>
      <p
        className={
          "mt-1 text-2xl font-bold " +
          (accent ? "text-amber-600" : "text-neutral-900")
        }
      >
        {value}
      </p>
    </div>
  );
}

function Chip({ on, label }: { on: boolean; label: string }) {
  return (
    <span
      className={
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-medium " +
        (on
          ? "border-green-300 bg-green-50 text-green-700"
          : "border-neutral-300 bg-neutral-100 text-neutral-500")
      }
    >
      <span
        className={
          "h-1.5 w-1.5 rounded-full " + (on ? "bg-green-500" : "bg-neutral-400")
        }
      />
      {label}
    </span>
  );
}
