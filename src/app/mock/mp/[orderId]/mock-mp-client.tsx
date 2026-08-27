"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch, ApiError } from "@/lib/api-client";

export default function MockMpClient({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"approved" | "rejected" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function simulate(outcome: "approved" | "rejected") {
    setBusy(outcome);
    setError(null);
    try {
      // Reproduce la notificacion que mandaria Mercado Pago.
      await apiFetch("/api/webhooks/mercadopago", {
        method: "POST",
        body: JSON.stringify({
          type: "payment",
          data: { id: `MOCK-${orderId}-${outcome}` },
        }),
      });
      router.push(`/pedido/${orderId}`);
    } catch (err) {
      setError((err as ApiError).message);
      setBusy(null);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6 py-12">
      <div className="rounded-2xl border border-dashed border-brand-300 bg-brand-50 p-6 text-center">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">
          Simulador de Mercado Pago (solo desarrollo)
        </p>
        <p className="mt-2 text-sm text-neutral-600">
          En producción con credenciales reales, acá estaría el Checkout Pro de
          Mercado Pago. Elegí un resultado para simular la notificación:
        </p>
      </div>

      {error && <p className="text-center text-sm text-red-600">{error}</p>}

      <button
        onClick={() => simulate("approved")}
        disabled={busy !== null}
        className="rounded-lg bg-green-600 px-4 py-3 font-semibold text-white hover:bg-green-700 disabled:opacity-60"
      >
        {busy === "approved" ? "Procesando..." : "Simular pago aprobado"}
      </button>
      <button
        onClick={() => simulate("rejected")}
        disabled={busy !== null}
        className="rounded-lg border border-red-300 px-4 py-3 font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60"
      >
        {busy === "rejected" ? "Procesando..." : "Simular pago rechazado"}
      </button>
    </main>
  );
}
