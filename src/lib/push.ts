import webpush from "web-push";
import { prisma } from "@/lib/prisma";
import { baseUrl } from "@/lib/base-url";
import type { OrderType } from "@/types";

// Notificaciones push del navegador para el seguimiento de un pedido
// (Fase 30). A pedido explícito del usuario, avisa SOLO la transición a
// "Listo" (el momento en que de verdad hace falta que el cliente actúe:
// retirarlo o esperar el envío) — no cada cambio de estado, para no
// generar ruido. Complementa el aviso de WhatsApp (que solo cubre la
// confirmación, por la plantilla pre-aprobada que exige Meta). Server-only.

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

function readyCopy(orderType: OrderType): { title: string; body: string } {
  return orderType === "DELIVERY"
    ? { title: "¡Tu pedido está listo!", body: "En breve sale a repartir." }
    : { title: "¡Tu pedido está listo!", body: "Ya lo podés retirar en el local." };
}

// Nunca hace fallar al que la llama (el cambio de estado ya se guardó,
// mismo criterio que `notifyOrderConfirmed` de WhatsApp) — un push que
// falla no debería tumbar el PATCH de /comanda.
export async function notifyOrderReady(
  orderId: string,
  orderType: OrderType,
  tenantId: string
): Promise<void> {
  if (!isPushConfigured()) return;
  const message = readyCopy(orderType);

  const subs = await prisma.pushSubscription.findMany({ where: { orderId } });
  if (subs.length === 0) return;

  // Slug (para el link de "ver pedido") + ícono propio del local (si subió
  // uno) — sin esto, las notificaciones de CUALQUIER local mostrarían
  // siempre el mismo link/ícono genérico en vez del suyo.
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { slug: true, settings: { select: { iconUrl: true } } },
  });
  const tenantSlug = tenant?.slug ?? "rowlys";

  ensureConfigured();
  const payload = JSON.stringify({
    ...message,
    url: `/${tenantSlug}/pedido/${orderId}`,
    icon: tenant?.settings?.iconUrl ?? undefined,
  });

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
