import crypto from "crypto";
import type { PaymentStatus } from "@/types";

// Capa del proveedor Mercado Pago (Checkout Pro: billetera + tarjetas +
// transferencia/CVU, todo con el mismo webhook). Server-only.
//
// En modo mock (MP_MOCK=true o sin MP_ACCESS_TOKEN) no se llama a la API real:
// la preferencia apunta a la pagina /mock/mp/[orderId] y el webhook confia en
// el convenio de `data.id` (MOCK-<orderId>-<approved|rejected>). Sirve para ver
// el flujo completo en dev sin cuenta de MP ni tunel para el webhook.

const MP_API = "https://api.mercadopago.com";

export function isMpMock(): boolean {
  return process.env.MP_MOCK === "true" || !process.env.MP_ACCESS_TOKEN;
}

function baseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, "") ??
    "http://localhost:3000"
  );
}

export interface PreferenceInput {
  orderId: string;
  total: number;
  description: string;
  payer?: { name?: string; surname?: string; email?: string };
}

export interface PreferenceResult {
  id: string;
  initPoint: string;
}

export async function createPreference(
  input: PreferenceInput
): Promise<PreferenceResult> {
  const trackUrl = `${baseUrl()}/pedido/${input.orderId}`;

  if (isMpMock()) {
    return {
      id: `MOCK-PREF-${input.orderId}`,
      initPoint: `${baseUrl()}/mock/mp/${input.orderId}`,
    };
  }

  const res = await fetch(`${MP_API}/checkout/preferences`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      items: [
        {
          id: input.orderId,
          title: input.description,
          quantity: 1,
          unit_price: input.total,
          currency_id: "ARS",
        },
      ],
      external_reference: input.orderId,
      notification_url: `${baseUrl()}/api/webhooks/mercadopago`,
      back_urls: { success: trackUrl, failure: trackUrl, pending: trackUrl },
      auto_return: "approved",
      payer: input.payer
        ? {
            name: input.payer.name,
            surname: input.payer.surname,
            email: input.payer.email,
          }
        : undefined,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `Mercado Pago rechazo la creacion de la preferencia (${res.status}). ${detail}`.trim()
    );
  }

  const data = (await res.json()) as {
    id: string;
    init_point?: string;
    sandbox_init_point?: string;
  };
  const initPoint = data.init_point ?? data.sandbox_init_point;
  if (!initPoint) {
    throw new Error("Mercado Pago no devolvio un init_point utilizable.");
  }
  return { id: String(data.id), initPoint };
}

// Estado de pago de MP -> nuestro PaymentStatus. Los estados intermedios
// (pending, in_process, authorized) se dejan como PENDING a la espera de una
// notificacion posterior.
export function mapMpStatus(mpStatus: string): PaymentStatus {
  switch (mpStatus) {
    case "approved":
      return "CONFIRMED";
    case "rejected":
    case "cancelled":
    case "refunded":
    case "charged_back":
      return "FAILED";
    default:
      return "PENDING";
  }
}

export interface MpPaymentInfo {
  id: string;
  status: string;
  externalReference: string | null;
  raw: unknown;
}

// Resuelve la notificacion del webhook a datos de pago. En mock, deriva todo del
// convenio de `dataId`. En real, consulta GET /v1/payments/{id}.
export async function fetchPaymentInfo(dataId: string): Promise<MpPaymentInfo> {
  if (dataId.startsWith("MOCK-")) {
    // MOCK-<orderId>-<approved|rejected>
    const rest = dataId.slice("MOCK-".length);
    const sep = rest.lastIndexOf("-");
    const orderId = rest.slice(0, sep);
    const outcome = rest.slice(sep + 1);
    return {
      id: dataId,
      status: outcome === "approved" ? "approved" : "rejected",
      externalReference: orderId,
      raw: { mock: true, dataId },
    };
  }

  const res = await fetch(`${MP_API}/v1/payments/${dataId}`, {
    headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}` },
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `No se pudo consultar el pago ${dataId} en Mercado Pago (${res.status}). ${detail}`.trim()
    );
  }
  const data = (await res.json()) as {
    id: number | string;
    status: string;
    external_reference: string | null;
  };
  return {
    id: String(data.id),
    status: data.status,
    externalReference: data.external_reference,
    raw: data,
  };
}

// Valida la firma `x-signature` de la notificacion (esquema HMAC-SHA256 de MP).
// Manifest: `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`
// En mock, o sin MP_WEBHOOK_SECRET configurado, no se valida.
export function verifyWebhookSignature(params: {
  signatureHeader: string | null;
  requestId: string | null;
  dataId: string;
}): boolean {
  const secret = process.env.MP_WEBHOOK_SECRET;
  if (isMpMock() || !secret) return true;
  if (params.dataId.startsWith("MOCK-")) return true;
  if (!params.signatureHeader) return false;

  const parts = Object.fromEntries(
    params.signatureHeader.split(",").map((kv) => {
      const [k, v] = kv.split("=");
      return [k?.trim(), v?.trim()];
    })
  );
  const ts = parts["ts"];
  const v1 = parts["v1"];
  if (!ts || !v1) return false;

  // MP indica normalizar el data.id alfanumerico a minusculas.
  const id = /[a-zA-Z]/.test(params.dataId)
    ? params.dataId.toLowerCase()
    : params.dataId;
  const manifest = `id:${id};request-id:${params.requestId ?? ""};ts:${ts};`;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(manifest)
    .digest("hex");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected, "hex"),
      Buffer.from(v1, "hex")
    );
  } catch {
    return false;
  }
}
