import { baseUrl } from "@/lib/base-url";
import type { WhatsAppSendResult } from "@/types";

// Aviso automático al cliente por WhatsApp cuando el local confirma el pedido.
// Usa la API oficial de Meta (WhatsApp Cloud API). Server-only.
//
// Como es un mensaje iniciado por el negocio (sin ventana de conversación
// abierta), Meta OBLIGA a usar una plantilla pre-aprobada — no se puede mandar
// texto libre. Ver `WHATSAPP_TEMPLATE_NAME` abajo y la nota en `.env.example`.
//
// En modo mock (WHATSAPP_MOCK=true, y SOLO así — no se infiere de la falta de
// token) no se llama a Meta: se loguea el mensaje que se enviaría. Sirve para
// ver el flujo sin cuenta de Meta Business.

const GRAPH_API = "https://graph.facebook.com/v21.0";
const SEND_TIMEOUT_MS = 8000;

export function isWhatsAppMock(): boolean {
  return process.env.WHATSAPP_MOCK === "true";
}

// El aviso se intenta si hay mock o credenciales reales en el entorno.
export function isWhatsAppEnabled(): boolean {
  return (
    isWhatsAppMock() ||
    (!!process.env.WHATSAPP_TOKEN && !!process.env.WHATSAPP_PHONE_NUMBER_ID)
  );
}

// Normaliza un teléfono argentino a E.164 sin "+" para WhatsApp: `549` + área
// (2-4 díg.) + número local (6-8 díg.), total 13 dígitos. Meta exige el `9` de
// móvil para Argentina. Maneja los formatos comunes que carga la gente:
// +54, 0054, prefijo 0 de larga distancia, prefijo 15 de celular, y el 9.
// Si no llega a 10 dígitos de "área + local" limpios, devuelve null y el aviso
// se saltea (mejor no enviar que enviar a un número mal armado).
export function normalizeArPhone(raw: string): string | null {
  let d = (raw ?? "").replace(/\D/g, "");
  if (!d) return null;

  if (d.startsWith("0054")) d = d.slice(4);
  else if (d.startsWith("54")) d = d.slice(2);
  if (d.startsWith("9")) d = d.slice(1); // se re-agrega al final
  if (d.startsWith("0")) d = d.slice(1); // prefijo larga distancia

  // Prefijo 15 (viejo de celular) entre el área y el número local.
  const m = d.match(/^(\d{2,4})15(\d{6,8})$/);
  if (m) d = m[1] + m[2];

  if (d.length !== 10) return null;
  return "549" + d;
}

interface OrderForNotify {
  id: string;
  customerFirstName: string;
  customerPhone: string;
}

export async function notifyOrderConfirmed(
  order: OrderForNotify,
  storeName: string
): Promise<WhatsAppSendResult> {
  if (!isWhatsAppEnabled()) {
    return { status: "skipped", reason: "WhatsApp no configurado en este entorno." };
  }

  const to = normalizeArPhone(order.customerPhone);
  if (!to) {
    return {
      status: "skipped",
      reason: `No se pudo normalizar el teléfono "${order.customerPhone}".`,
    };
  }

  const trackUrl = `${baseUrl()}/pedido/${order.id}`;
  const templateName = process.env.WHATSAPP_TEMPLATE_NAME ?? "order_confirmed";
  const templateLang = process.env.WHATSAPP_TEMPLATE_LANG ?? "es_AR";
  // {{1}} nombre · {{2}} local · {{3}} link de seguimiento
  const bodyParams = [order.customerFirstName, storeName, trackUrl];

  if (isWhatsAppMock()) {
    const body = `[mock ${templateName}/${templateLang}] +${to} — Hola ${bodyParams[0]}, tu pedido en ${bodyParams[1]} fue confirmado. Seguí el estado acá: ${bodyParams[2]}`;
    console.log("WhatsApp (mock) →", body);
    return { status: "mock", to, body };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
  try {
    const res = await fetch(
      `${GRAPH_API}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "template",
          template: {
            name: templateName,
            language: { code: templateLang },
            components: [
              {
                type: "body",
                parameters: bodyParams.map((text) => ({ type: "text", text })),
              },
            ],
          },
        }),
      }
    );
    const data = (await res.json().catch(() => ({}))) as {
      messages?: { id?: string }[];
      error?: unknown;
    };
    if (!res.ok) {
      throw new Error(
        `Meta WhatsApp API ${res.status}: ${JSON.stringify(data.error ?? data)}`
      );
    }
    return { status: "sent", to, id: data.messages?.[0]?.id };
  } finally {
    clearTimeout(timer);
  }
}
