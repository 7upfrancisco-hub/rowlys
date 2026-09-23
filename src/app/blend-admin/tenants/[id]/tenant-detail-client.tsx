"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch, ApiError } from "@/lib/api-client";
import { formatCurrency } from "@/types";
import BlendAdminHeader from "@/components/BlendAdminHeader";

interface TenantUser {
  id: string;
  username: string;
  createdAt: string;
}

interface TenantDetail {
  id: string;
  slug: string;
  name: string;
  active: boolean;
  createdAt: string;
  users: TenantUser[];
  settings: {
    storePhone: string | null;
    storeAddress: string | null;
    instagramHandle: string | null;
    tiktokHandle: string | null;
    bankAlias: string | null;
  } | null;
  menu: { categoryCount: number; productCount: number };
  customerCount: number;
}

interface CustomerRow {
  id: string;
  phone: string;
  firstName: string;
  lastName: string;
  ordersCount: number;
  totalSpent: number;
}

const AR_TZ = "America/Argentina/Buenos_Aires";

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-AR", {
    timeZone: AR_TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function ResetPasswordRow({
  tenantId,
  user,
}: {
  tenantId: string;
  user: TenantUser;
}) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await apiFetch(`/api/blend-admin/tenants/${tenantId}/users/${user.id}`, {
        method: "PATCH",
        body: JSON.stringify({ password }),
      });
      setDone(true);
      setPassword("");
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 border-t border-neutral-100 py-3 first:border-t-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-mono text-sm font-medium text-neutral-900">
            {user.username}
          </p>
          <p className="text-xs text-neutral-400">
            Usuario desde {fmtDate(user.createdAt)}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setOpen((v) => !v);
            setDone(false);
            setError(null);
          }}
          className="text-xs font-semibold text-navy-700 hover:underline"
        >
          {open ? "Cancelar" : "Restablecer contraseña"}
        </button>
      </div>
      {open && (
        <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Contraseña nueva (mín. 6 caracteres)"
            className="min-w-[16rem] flex-1 rounded-lg border border-neutral-300 px-3 py-1.5 text-sm focus:border-navy-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={saving || password.length < 6}
            className="rounded-lg bg-navy-800 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-navy-900 disabled:opacity-50"
          >
            {saving ? "Guardando..." : "Guardar"}
          </button>
        </form>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
      {done && (
        <p className="text-xs text-green-600">
          Contraseña actualizada — pasásela al local por otro medio, acá no
          queda guardada en ningún lado.
        </p>
      )}
    </div>
  );
}

export default function TenantDetailClient({
  tenantId,
}: {
  tenantId: string;
}) {
  const [tenant, setTenant] = useState<TenantDetail | null>(null);
  const [customers, setCustomers] = useState<CustomerRow[] | null>(null);
  const [customerSearch, setCustomerSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [entering, setEntering] = useState(false);

  useEffect(() => {
    apiFetch<TenantDetail>(`/api/blend-admin/tenants/${tenantId}`)
      .then(setTenant)
      .catch((err: ApiError) => setError(err.message));
  }, [tenantId]);

  useEffect(() => {
    const t = setTimeout(() => {
      const qs = new URLSearchParams({ tenantId });
      if (customerSearch.trim()) qs.set("search", customerSearch.trim());
      apiFetch<CustomerRow[]>(`/api/blend-admin/customers?${qs.toString()}`)
        .then(setCustomers)
        .catch((err: ApiError) => setError(err.message));
    }, 250);
    return () => clearTimeout(t);
  }, [tenantId, customerSearch]);

  async function enterTenant() {
    if (!tenant) return;
    setEntering(true);
    try {
      await apiFetch(`/api/blend-admin/tenants/${tenant.id}/impersonate`, {
        method: "POST",
      });
      window.location.href = "/admin";
    } catch (err) {
      setError((err as ApiError).message);
      setEntering(false);
    }
  }

  return (
    <div>
      <BlendAdminHeader />

      <main className="mx-auto max-w-5xl px-6 py-10">
        <Link
          href="/blend-admin"
          className="mb-4 inline-block text-sm text-neutral-500 hover:underline"
        >
          ← Dashboard
        </Link>

        {error && (
          <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        )}

        {!tenant ? (
          <p className="text-neutral-500">Cargando...</p>
        ) : (
          <div className="flex flex-col gap-6">
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
              <div>
                <h2 className="text-2xl font-bold text-navy-900">
                  {tenant.name}
                </h2>
                <p className="font-mono text-sm text-neutral-400">
                  /{tenant.slug}
                </p>
                <span
                  className={
                    "mt-2 inline-block rounded-full px-3 py-1 text-xs font-semibold " +
                    (tenant.active
                      ? "bg-green-100 text-green-700"
                      : "bg-neutral-200 text-neutral-600")
                  }
                >
                  {tenant.active ? "Activo" : "Inactivo"}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                <a
                  href={`/${tenant.slug}/menu`}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-700 transition hover:bg-neutral-50"
                >
                  Ver carta pública ↗
                </a>
                <button
                  type="button"
                  onClick={enterTenant}
                  disabled={entering}
                  className="rounded-lg bg-navy-800 px-4 py-2 text-sm font-semibold text-white transition hover:bg-navy-900 disabled:opacity-50"
                >
                  {entering ? "Entrando..." : "Entrar al panel →"}
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
              <h3 className="mb-4 text-lg font-bold text-navy-900">
                Datos del local
              </h3>
              <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-neutral-400">Teléfono</dt>
                  <dd className="text-neutral-800">
                    {tenant.settings?.storePhone || "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-neutral-400">Dirección</dt>
                  <dd className="text-neutral-800">
                    {tenant.settings?.storeAddress || "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-neutral-400">Instagram</dt>
                  <dd className="text-neutral-800">
                    {tenant.settings?.instagramHandle || "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-neutral-400">TikTok</dt>
                  <dd className="text-neutral-800">
                    {tenant.settings?.tiktokHandle || "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-neutral-400">Alias bancario</dt>
                  <dd className="text-neutral-800">
                    {tenant.settings?.bankAlias || "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-neutral-400">Local creado</dt>
                  <dd className="text-neutral-800">
                    {fmtDate(tenant.createdAt)}
                  </dd>
                </div>
              </dl>
            </div>

            <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
              <h3 className="mb-1 text-lg font-bold text-navy-900">
                Usuario y contraseña
              </h3>
              <p className="mb-3 text-sm text-neutral-500">
                La contraseña queda hasheada — no hay forma de verla, solo de
                restablecerla por una nueva.
              </p>
              {tenant.users.length === 0 ? (
                <p className="text-sm text-neutral-400">
                  Este local no tiene ningún usuario cargado.
                </p>
              ) : (
                tenant.users.map((u) => (
                  <ResetPasswordRow key={u.id} tenantId={tenant.id} user={u} />
                ))
              )}
            </div>

            <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
              <h3 className="mb-4 text-lg font-bold text-navy-900">Menú</h3>
              <div className="flex flex-wrap gap-6 text-sm">
                <div>
                  <p className="text-2xl font-bold text-navy-900">
                    {tenant.menu.categoryCount}
                  </p>
                  <p className="text-neutral-500">Categorías</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-navy-900">
                    {tenant.menu.productCount}
                  </p>
                  <p className="text-neutral-500">Productos</p>
                </div>
              </div>
              <p className="mt-4 text-sm text-neutral-500">
                Para editar el menú, entrá al panel del local con &ldquo;Entrar
                al panel →&rdquo;.
              </p>
            </div>

            <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-lg font-bold text-navy-900">
                  Clientes ({tenant.customerCount})
                </h3>
                <input
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  placeholder="Buscar por nombre o teléfono..."
                  className="w-full max-w-xs rounded-lg border border-neutral-300 px-3 py-1.5 text-sm focus:border-navy-500 focus:outline-none"
                />
              </div>
              {customers === null ? (
                <p className="text-sm text-neutral-500">Cargando...</p>
              ) : customers.length === 0 ? (
                <p className="text-sm text-neutral-400">
                  Todavía no hay clientes.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-neutral-200">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-neutral-50 text-neutral-500">
                      <tr>
                        <th className="px-3 py-2 font-medium">Cliente</th>
                        <th className="px-3 py-2 font-medium">Teléfono</th>
                        <th className="px-3 py-2 font-medium">Pedidos</th>
                        <th className="px-3 py-2 font-medium">Gastado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                      {customers.map((c) => (
                        <tr key={c.id}>
                          <td className="px-3 py-2 text-neutral-800">
                            {c.firstName} {c.lastName}
                          </td>
                          <td className="px-3 py-2 font-mono text-neutral-600">
                            {c.phone}
                          </td>
                          <td className="px-3 py-2 text-neutral-600">
                            {c.ordersCount}
                          </td>
                          <td className="px-3 py-2 text-neutral-600">
                            {formatCurrency(c.totalSpent)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
