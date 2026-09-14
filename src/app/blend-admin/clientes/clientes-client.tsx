"use client";

import { useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api-client";
import { formatCurrency } from "@/types";
import BlendAdminHeader from "@/components/BlendAdminHeader";

interface PlatformCustomerRow {
  id: string;
  phone: string;
  firstName: string;
  lastName: string;
  email: string | null;
  ordersCount: number;
  totalSpent: number;
  createdAt: string;
  tenantName: string;
  tenantSlug: string | null;
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

export default function ClientesClient() {
  const [rows, setRows] = useState<PlatformCustomerRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const t = setTimeout(() => {
      const qs = new URLSearchParams();
      if (search.trim()) qs.set("search", search.trim());
      apiFetch<PlatformCustomerRow[]>(`/api/blend-admin/customers?${qs.toString()}`)
        .then(setRows)
        .catch((err: ApiError) => setError(err.message));
    }, 250);
    return () => clearTimeout(t);
  }, [search]);

  return (
    <div>
      <BlendAdminHeader />

      <main className="mx-auto max-w-5xl px-6 py-10">
        <h2 className="mb-1 text-2xl font-bold text-navy-900">
          Clientes de la plataforma
        </h2>
        <p className="mb-6 text-sm text-neutral-500">
          Todos los consumidores finales que compraron en cualquier local que
          usa Blend, con qué local compraron. Pedidos y gastado cuentan solo
          pedidos aceptados por ese local.
        </p>

        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre o teléfono..."
          className="mb-4 w-full max-w-sm rounded-lg border border-neutral-300 px-4 py-2 focus:border-navy-500 focus:outline-none"
        />

        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

        {rows === null ? (
          <p className="text-neutral-500">Cargando...</p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-neutral-200">
            <table className="w-full text-left text-sm">
              <thead className="bg-neutral-50 text-neutral-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Cliente</th>
                  <th className="px-4 py-3 font-medium">Teléfono</th>
                  <th className="px-4 py-3 font-medium">Local</th>
                  <th className="px-4 py-3 font-medium">Pedidos</th>
                  <th className="px-4 py-3 font-medium">Gastado</th>
                  <th className="px-4 py-3 font-medium">Cliente desde</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {rows.map((c) => (
                  <tr key={c.id}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-neutral-900">
                        {c.firstName} {c.lastName}
                      </p>
                      {c.email && (
                        <p className="text-xs text-neutral-400">{c.email}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-neutral-600">
                      {c.phone}
                    </td>
                    <td className="px-4 py-3 text-neutral-600">{c.tenantName}</td>
                    <td className="px-4 py-3 text-neutral-600">{c.ordersCount}</td>
                    <td className="px-4 py-3 text-neutral-600">
                      {formatCurrency(c.totalSpent)}
                    </td>
                    <td className="px-4 py-3 text-neutral-600">
                      {fmtDate(c.createdAt)}
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-neutral-400">
                      Sin clientes todavía.
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
