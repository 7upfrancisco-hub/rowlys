import webpush from "web-push";
import { prisma } from "@/lib/prisma";
import { baseUrl } from "@/lib/base-url";
import type { OrderStatus, OrderType } from "@/types";

// Notificaciones push del navegador para el seguimiento de un pedido
// (Fase 30) — complementa el aviso de WhatsApp (que solo cubre la
// transición a Confirmado, por la plantilla pre-aprobada que exige Meta):
// esto avisa CUALQUIER cambio de estado, no necesita cuenta de terceros ni
// aprobación, y funciona ya mismo sin depender de que el trámite de Meta
// Business esté listo. Server-only.

export function isPushConfigured(): boolean {
  return !!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && !!process.env.VAPID_PRIVATE_KEY;
}

let configured = false;
function ensureConfigured() {
  if (configured) return;
  // web-push exige que el subject sea "https:" o "mailto:" — baseUrl() cae a
  // "http://localhost:3000" en dev local, que lo rechaza; ahí se usa un
  // mailto de respaldo en vez de romper el envío.
  const url = baseUrl();
  const subject = process.env.VAPID_SUBJECT || (url.startsWith("https:") ? url : "mailto:soporte@blend.app");
  webpush.setVapidDetails(
    subject,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  );
  configured = true;
}

// Copy por estado — mismo tono que ORDER_STATUS_LABELS pero en primera
// persona hacia el cliente. CANCELLED no tiene wording de "listo para
// retirar/enviar" porque no aplica.
function copyForStatus(status: OrderStatus, orderType: OrderType): { title: string; body: string } | null {
  switch (status) {
    case "CONFIRMED":
      return { title: "¡Tu pedido fue confirmado!", body: "Ya lo estamos preparando." };
    case "IN_PROGRESS":
      return { title: "Tu pedido está en preparación", body: "Te avisamos cuando esté listo." };
    case "READY":
      return orderType === "DELIVERY"
        ? { title: "¡Tu pedido está listo!", body: "En breve sale a repartir." }
        : { title: "¡Tu pedido está listo!", body: "Ya lo podés retirar en el local." };
    case "DELIVERED":
      return { title: "Tu pedido fue entregado", body: "¡Gracias por tu compra!" };
    case "CANCELLED":
      return { title: "Tu pedido fue cancelado", body: "Cualquier duda, contactá al local." };
    default:
      return null;
  }
}

// Nunca hace fallar al que la llama (el cambio de estado ya se guardó,
// mismo criterio que `notifyOrderConfirmed` de WhatsApp) — un push que
// falla no debería tumbar el PATCH de /comanda.
export async function notifyOrderStatusPush(
  orderId: string,
  status: OrderStatus,
  orderType: OrderType
): Promise<void> {
  if (!isPushConfigured()) return;
  const message = copyForStatus(status, orderType);
  if (!message) return;

  const subs = await prisma.pushSubscription.findMany({ where: { orderId } });
  if (subs.length === 0) return;

  ensureConfigured();
  const payload = JSON.stringify({ ...message, url: `/pedido/${orderId}` });

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        );
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          // La suscripción venció o el navegador la borró del otro lado —
          // limpiar acá evita reintentar para siempre contra un endpoint muerto.
          await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
        } else {
          console.error("Push: envío falló para", sub.id, err);
        }
      }
    })
  );
}
