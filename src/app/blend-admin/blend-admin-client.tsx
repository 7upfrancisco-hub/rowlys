"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api-client";
import { formatCurrency } from "@/types";
import BlendAdminHeader from "@/components/BlendAdminHeader";
import DailyRevenueChart, { type DailyPoint } from "@/components/DailyRevenueChart";

interface TenantRow {
  id: string;
  slug: string;
  name: string;
  active: boolean;
  createdAt: string;
  userCount: number;
  ordersThisMonth: number;
  revenueThisMonth: number;
}

interface PlatformMetrics {
  month: string;
  todayDay: number | null;
  daily: DailyPoint[];
}

function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      <p className="text-sm text-neutral-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-navy-900">{value}</p>
    </div>
  );
}

export default function BlendAdminClient() {
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [metrics, setMetrics] = useState<PlatformMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [enteringId, setEnteringId] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<{
    name: string;
    slug: string;
    username: string;
    password: string;
  } | null>(null);

  function load() {
    Promise.all([
      apiFetch<TenantRow[]>("/api/blend-admin/tenants"),
      apiFetch<PlatformMetrics>("/api/blend-admin/metrics"),
    ])
      .then(([t, m]) => {
        setTenants(t);
        setMetrics(m);
      })
      .catch((err: ApiError) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  const kpis = useMemo(() => {
    const active = tenants.filter((t) => t.active).length;
    const orders = tenants.reduce((s, t) => s + t.ordersThisMonth, 0);
    const revenue = tenants.reduce((s, t) => s + t.revenueThisMonth, 0);
    return { active, total: tenants.length, orders, revenue };
  }, [tenants]);

  function handleNameChange(v: string) {
    setName(v);
    if (!slugTouched) setSlug(slugify(v));
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setCreating(true);
    try {
      await apiFetch("/api/blend-admin/tenants", {
        method: "POST",
        body: JSON.stringify({ name, slug, username, password }),
      });
      setCreated({ name, slug, username, password });
      setName("");
      setSlug("");
      setSlugTouched(false);
      setUsername("");
      setPassword("");
      setShowForm(false);
      load();
    } catch (err) {
      setFormError((err as ApiError).message);
    } finally {
      setCreating(false);
    }
  }

  async function toggleActive(t: TenantRow) {
    setTenants((prev) =>
      prev.map((x) => (x.id === t.id ? { ...x, active: !x.active } : x))
    );
    try {
      await apiFetch(`/api/blend-admin/tenants/${t.id}`, {
        method: "PATCH",
        body: JSON.stringify({ active: !t.active }),
      });
    } catch (err) {
      setTenants((prev) =>
        prev.map((x) => (x.id === t.id ? { ...x, active: t.active } : x))
      );
      setError((err as ApiError).message);
    }
  }

  // "Entrar a este local": arma una sesión de tenant para soporte y navega
  // a SU /admin, sin pedir la contraseña de ese local.
  async function enterTenant(t: TenantRow) {
    setEnteringId(t.id);
    try {
      await apiFetch(`/api/blend-admin/tenants/${t.id}/impersonate`, {
        method: "POST",
      });
      window.location.href = "/admin";
    } catch (err) {
      setError((err as ApiError).message);
      setEnteringId(null);
    }
  }

  return (
    <div>
      <BlendAdminHeader />

      <main className="mx-auto max-w-5xl px-6 py-10">
        <h2 className="mb-6 text-2xl font-bold text-navy-900">Dashboard</h2>

        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <KpiCard label="Locales activos" value={`${kpis.active} / ${kpis.total}`} />
          <KpiCard label="Pedidos (mes, todos los locales)" value={String(kpis.orders)} />
          <KpiCard label="Facturado (mes, todos los locales)" value={formatCurrency(kpis.revenue)} />
          <KpiCard label="Usuarios totales" value={String(tenants.reduce((s, t) => s + t.userCount, 0))} />
        </div>

        {metrics && (
          <div className="mb-8">
            <DailyRevenueChart
              daily={metrics.daily}
              month={metrics.month}
              todayDay={metrics.todayDay}
              title="Facturado por día — toda la plataforma"
              color="#1e293b"
              emptyLabel="Sin ventas facturables este mes en ningún local."
            />
          </div>
        )}

        <div className="mb-6 flex items-center justify-between">
          <h3 className="text-xl font-bold text-navy-900">Clientes de Blend</h3>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="rounded-lg bg-navy-800 px-4 py-2 text-sm font-semibold text-white transition hover:bg-navy-900"
          >
            {showForm ? "Cancelar" : "+ Nuevo local"}
          </button>
        </div>

        {created && (
          <div className="mb-6 flex flex-col gap-1 rounded-xl border border-green-200 bg-green-50 p-4 text-sm">
            <p className="font-semibold text-green-800">
              Local "{created.name}" creado.
            </p>
            <p className="text-green-700">
              Login: <span className="font-mono">{created.username}</span> /{" "}
              <span className="font-mono">{created.password}</span> — guardalo
              ahora, no se puede volver a ver.
            </p>
            <button
              onClick={() => setCreated(null)}
              className="mt-1 w-fit text-xs font-medium text-green-700 underline"
            >
              Cerrar
            </button>
          </div>
        )}

        {showForm && (
          <form
            onSubmit={handleCreate}
            className="mb-8 flex max-w-lg flex-col gap-4 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm"
          >
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-neutral-700">
                Nombre del local
              </label>
              <input
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="Pizzería Don José"
                className="rounded-lg border border-neutral-300 px-4 py-2 focus:border-navy-500 focus:outline-none"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-neutral-700">
                Slug (URL)
              </label>
              <input
                value={slug}
                onChange={(e) => {
                  setSlugTouched(true);
                  setSlug(slugify(e.target.value));
                }}
                placeholder="pizzeria-don-jose"
                className="rounded-lg border border-neutral-300 px-4 py-2 font-mono text-sm focus:border-navy-500 focus:outline-none"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-neutral-700">
                Usuario (login del local)
              </label>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="rounded-lg border border-neutral-300 px-4 py-2 focus:border-navy-500 focus:outline-none"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-neutral-700">
                Contraseña inicial
              </label>
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="rounded-lg border border-neutral-300 px-4 py-2 focus:border-navy-500 focus:outline-none"
              />
            </div>
            {formError && <p className="text-sm text-red-600">{formError}</p>}
            <button
              type="submit"
              disabled={creating || !name.trim() || !slug.trim() || !username.trim() || !password}
              className="w-fit rounded-lg bg-navy-800 px-4 py-2.5 font-semibold text-white transition hover:bg-navy-900 disabled:opacity-60"
            >
              {creating ? "Creando..." : "Crear local"}
            </button>
          </form>
        )}

        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

        {loading ? (
          <p className="text-neutral-500">Cargando...</p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-neutral-200">
            <table className="w-full text-left text-sm">
              <thead className="bg-neutral-50 text-neutral-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Local</th>
                  <th className="px-4 py-3 font-medium">Usuarios</th>
                  <th className="px-4 py-3 font-medium">Pedidos (mes)</th>
                  <th className="px-4 py-3 font-medium">Facturado (mes)</th>
                  <th className="px-4 py-3 font-medium">Estado</th>
                  <th className="px-4 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {tenants.map((t) => (
                  <tr key={t.id}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-neutral-900">{t.name}</p>
                      <p className="font-mono text-xs text-neutral-400">
                        /{t.slug}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-neutral-600">{t.userCount}</td>
                    <td className="px-4 py-3 text-neutral-600">
                      {t.ordersThisMonth}
                    </td>
                    <td className="px-4 py-3 text-neutral-600">
                      {formatCurrency(t.revenueThisMonth)}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => toggleActive(t)}
                        className={
                          "rounded-full px-3 py-1 text-xs font-semibold " +
                          (t.active
                            ? "bg-green-100 text-green-700 hover:bg-green-200"
                            : "bg-neutral-200 text-neutral-600 hover:bg-neutral-300")
                        }
                      >
                        {t.active ? "Activo" : "Inactivo"}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => enterTenant(t)}
                        disabled={enteringId === t.id}
                        className="text-xs font-semibold text-navy-700 hover:underline disabled:opacity-50"
                      >
                        {enteringId === t.id ? "Entrando..." : "Entrar →"}
                      </button>
                    </td>
                  </tr>
                ))}
                {tenants.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-neutral-400">
                      Todavía no hay locales cargados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
