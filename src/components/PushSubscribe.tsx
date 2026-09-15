"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";

// Necesario porque `PushManager.subscribe` pide la VAPID public key como
// Uint8Array, no como el string base64url que se genera/guarda — conversión
// estándar documentada por la spec de Web Push, no hay helper nativo.
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

type Status = "checking" | "unsupported" | "denied" | "subscribed" | "off";

// Botón para activar avisos push del seguimiento de ESTE pedido (Fase 30) —
// complementa el WhatsApp automático, que solo cubre la confirmación. No se
// renderiza nada si el proyecto no tiene VAPID configurado (ver
// src/lib/push.ts) o si el navegador no soporta Push (Safari < 16.4, algunos
// in-app browsers).
export default function PushSubscribe({ orderId }: { orderId: string }) {
  const [status, setStatus] = useState<Status>("checking");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  useEffect(() => {
    if (!vapidKey) {
      setStatus("unsupported");
      return;
    }
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setStatus("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setStatus("denied");
      return;
    }
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setStatus(sub ? "subscribed" : "off"))
      .catch(() => setStatus("off"));
  }, [vapidKey]);

  async function unsubscribe() {
    setBusy(true);
    setError(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await apiFetch(`/api/orders/${orderId}/push-subscribe`, {
          method: "DELETE",
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setStatus("off");
    } catch (err) {
      setError("No se pudo desactivar. Probá de nuevo en un rato.");
      console.error("Push: fallo al desuscribirse", err);
    } finally {
      setBusy(false);
    }
  }

  async function subscribe() {
    if (!vapidKey) return;
    setBusy(true);
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "denied" : "off");
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
      });
      const json = sub.toJSON() as { endpoint: string; keys?: { p256dh: string; auth: string } };
      if (!json.keys) throw new Error("El navegador no devolvió las claves de la suscripción.");
      await apiFetch(`/api/orders/${orderId}/push-subscribe`, {
        method: "POST",
        body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
      });
      setStatus("subscribed");
    } catch (err) {
      setError("No se pudo activar. Probá de nuevo en un rato.");
      console.error("Push: fallo al suscribirse", err);
    } finally {
      setBusy(false);
    }
  }

  if (status === "checking" || status === "unsupported" || status === "denied") return null;

  if (status === "subscribed") {
    return (
      <p className="mb-4 flex items-center gap-2 text-sm text-muted">
        <span aria-hidden>🔔</span> Te avisamos acá cuando cambie el estado.
        <button
          type="button"
          onClick={unsubscribe}
          disabled={busy}
          className="text-xs font-medium underline hover:text-fg disabled:opacity-60"
        >
          Desactivar
        </button>
      </p>
    );
  }

  return (
    <div className="mb-4">
      <button
        type="button"
        onClick={subscribe}
        disabled={busy}
        className="rounded-lg border border-line bg-surface px-3 py-2 text-sm font-medium text-fg transition hover:bg-surface-2 disabled:opacity-60"
      >
        {busy ? "Activando..." : "🔔 Avisame cuando cambie el estado"}
      </button>
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
}
