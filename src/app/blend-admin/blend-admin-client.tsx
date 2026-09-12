"use client";

import { useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api-client";
import { formatCurrency } from "@/types";
import LogoutButton from "@/components/LogoutButton";

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

function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export default function BlendAdminClient() {
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    apiFetch<TenantRow[]>("/api/blend-admin/tenants")
      .then(setTenants)
      .catch((err: ApiError) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

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
      // revierte si falló
      setTenants((prev) =>
        prev.map((x) => (x.id === t.id ? { ...x, active: t.active } : x))
      );
      setError((err as ApiError).message);
    }
  }

  return (
    <div>
      <header className="border-b border-neutral-200 bg-navy-900">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-xl font-extrabold tracking-tight text-white">
              Blend
            </h1>
            <p className="text-sm text-navy-200">Super-admin</p>
          </div>
          <LogoutButton
            endpoint="/api/blend-admin/logout"
            redirectTo="/blend-admin/login"
          />
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-navy-900">Clientes de Blend</h2>
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
                  </tr>
                ))}
                {tenants.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-neutral-400">
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
