import crypto from "crypto";
import { baseUrl } from "@/lib/base-url";
import { PHANTOM_ORDER_HOURS } from "@/lib/phantom-orders";
import { prisma } from "@/lib/prisma";
import { encrypt, decrypt } from "@/lib/crypto";
import type { PaymentStatus } from "@/types";

// Capa del proveedor Mercado Pago (Checkout Pro: billetera + tarjetas +
// transferencia/CVU, todo con el mismo webhook). Server-only.
//
// En modo mock (MP_MOCK=true, y SOLO asi — no se infiere de la falta de token)
// no se llama a la API real: la preferencia apunta a la pagina /mock/mp/[orderId]
// y el webhook confia en el convenio de `data.id`
// (MOCK-<orderId>-<approved|rejected>). Sirve para ver el flujo completo en dev
// sin cuenta de MP ni tunel para el webhook. El check es explicito a proposito:
// en produccion sin `MP_MOCK` seteado, aunque falte el token, NO se entra en
// mock (si no, un cliente podria marcarse el pedido como pagado desde la pagina
// simuladora). Sin token real, `createPreference` falla con 502 y listo.
//
// Cada local puede conectar SU PROPIA cuenta de Mercado Pago (OAuth,
// "Conectar con Mercado Pago" desde /blend-admin) — ver getOwnAccessToken
// más abajo. Mientras no la conecte, todo sigue cobrando con el
// MP_ACCESS_TOKEN global de siempre (respaldo transicional).

const MP_API = "https://api.mercadopago.com";

export function isMpMock(): boolean {
  return process.env.MP_MOCK === "true";
}

// Si el checkout de ESTE tenant debe ofrecer Mercado Pago: el local no lo
// apagó a mano (Settings.mpEnabled, togglable desde /admin/configuracion) Y
// hay mock activo, o el local conectó su propia cuenta, o hay token global
// de respaldo.
export async function isMpAvailableForTenant(tenantId: string): Promise<boolean> {
  const settings = await prisma.settings.findUnique({
    where: { tenantId },
    select: { mpEnabled: true },
  });
  if (settings?.mpEnabled === false) return false;

  if (isMpMock()) return true;
  const own = await getOwnAccessToken(tenantId);
  return !!own || !!process.env.MP_ACCESS_TOKEN;
}

// --- OAuth: "Conectar con Mercado Pago" (Fase MP-marketplace) --------------

export function isMpOAuthConfigured(): boolean {
  return !!process.env.MP_CLIENT_ID && !!process.env.MP_CLIENT_SECRET;
}

function oauthRedirectUri(): string {
  return `${baseUrl()}/api/mercadopago/oauth/callback`;
}

// Arma la URL a la que se redirige el navegador para que el dueño del local
// autorice a Blend a operar en su cuenta. `state` es el JWT firmado de
// createMpOAuthStateToken — viaja de ida y vuelta por Mercado Pago, así que
// nunca se confía en él sin verificar la firma en el callback.
export function buildAuthorizationUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.MP_CLIENT_ID ?? "",
    response_type: "code",
    platform_id: "mp",
    state,
    redirect_uri: oauthRedirectUri(),
  });
  return `https://auth.mercadopago.com/authorization?${params.toString()}`;
}

interface OAuthTokenResult {
  accessToken: string;
  refreshToken: string;
  userId: string;
  expiresInSeconds: number;
}

function parseOAuthTokenResponse(data: {
  access_token: string;
  refresh_token: string;
  user_id: number | string;
  expires_in: number;
}): OAuthTokenResult {
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    userId: String(data.user_id),
    expiresInSeconds: data.expires_in,
  };
}

// Intercambia el `code` que Mercado Pago mandó al callback por los tokens
// de la cuenta que acaba de autorizar.
export async function exchangeCodeForToken(code: string): Promise<OAuthTokenResult> {
  const res = await fetch(`${MP_API}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.MP_CLIENT_ID,
      client_secret: process.env.MP_CLIENT_SECRET,
      grant_type: "authorization_code",
      code,
      redirect_uri: oauthRedirectUri(),
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Mercado Pago rechazó el intercambio del code (${res.status}). ${detail}`.trim());
  }
  return parseOAuthTokenResponse(await res.json());
}

// Pide un access token nuevo cuando el guardado está por vencer. Mercado
// Pago rota el refresh token en cada uso — SIEMPRE hay que guardar el que
// devuelve esta llamada, no reusar el viejo.
async function refreshAccessToken(refreshToken: string): Promise<OAuthTokenResult> {
  const res = await fetch(`${MP_API}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.MP_CLIENT_ID,
      client_secret: process.env.MP_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Mercado Pago rechazó el refresh del token (${res.status}). ${detail}`.trim());
  }
  return parseOAuthTokenResponse(await res.json());
}

// Refresca con margen de un día — evita quedarse sin token válido a mitad
// de una compra por vencer justo en el momento menos oportuno.
const REFRESH_MARGIN_MS = 24 * 60 * 60 * 1000;

// Access token de la cuenta de Mercado Pago que ESTE local conectó (o null
// si todavía no conectó ninguna, O si tenía una conectada pero el refresh
// falló). Refresca solo, guarda el resultado reencriptado si tuvo que
// hacerlo.
//
// El refresh puede fallar de verdad (el dueño desconectó la app desde su
// cuenta de MP, el refresh token quedó invalidado por una carrera con otro
// refresh concurrente — MP lo rota en cada uso —, o un corte transitorio de
// MP). Antes esa falla no se atajaba acá, así que se propagaba como
// excepción sin capturar hasta CUALQUIER caller: el checkout público
// (GET /api/[tenant]/settings), la creación de pedidos (createOrder) y la
// creación de preferencias de pago (resolvePaymentCredentials) — todos
// terminaban en un 500 genérico en vez de degradar con gracia. Como esta
// función YA modela "no hay token propio" como `null` (el caso normal de un
// tenant que nunca conectó nada), tratar un refresh fallido igual —
// devolver null en vez de relanzar — reusa ese mismo camino: los callers ya
// saben caer al token global o mostrar "Mercado Pago no disponible".
export async function getOwnAccessToken(tenantId: string): Promise<string | null> {
  const settings = await prisma.settings.findUnique({
    where: { tenantId },
    select: { mpAccessToken: true, mpRefreshToken: true, mpTokenExpiresAt: true },
  });
  if (!settings?.mpAccessToken || !settings.mpRefreshToken) return null;

  const expiresAt = settings.mpTokenExpiresAt?.getTime() ?? 0;
  if (expiresAt - Date.now() > REFRESH_MARGIN_MS) {
    return decrypt(settings.mpAccessToken);
  }

  try {
    const refreshed = await refreshAccessToken(decrypt(settings.mpRefreshToken));
    await prisma.settings.update({
      where: { tenantId },
      data: {
        mpAccessToken: encrypt(refreshed.accessToken),
        mpRefreshToken: encrypt(refreshed.refreshToken),
        mpTokenExpiresAt: new Date(Date.now() + refreshed.expiresInSeconds * 1000),
      },
    });
    return refreshed.accessToken;
  } catch (err) {
    console.error(`Mercado Pago: falló el refresh del token propio (tenant ${tenantId}):`, err);
    // El refresh es proactivo (arranca 24hs antes de vencer de verdad) — si
    // falló pero el token guardado todavía no venció, sigue sirviendo. Solo
    // se devuelve null si ya no queda nada usable.
    if (expiresAt > Date.now()) {
      return decrypt(settings.mpAccessToken);
    }
    return null;
  }
}

// Resuelve con qué access token y qué notification_url cobrarle a un
// pedido de este tenant: el propio si lo conectó, o el global de respaldo.
// En mock, los valores no se usan de verdad (createPreference corta antes),
// así que devuelve cualquier cosa no-vacía para no obligar al caller a
// hacer su propio if de mock.
export async function resolvePaymentCredentials(
  tenantId: string,
  tenantSlug: string
): Promise<{ accessToken: string; notificationUrl: string } | null> {
  if (isMpMock()) {
    return { accessToken: "mock", notificationUrl: `${baseUrl()}/api/webhooks/mercadopago` };
  }
  const own = await getOwnAccessToken(tenantId);
  if (own) {
    return {
      accessToken: own,
      // Con slug adentro: así el webhook sabe con qué token propio pedirle
      // el detalle del pago a Mercado Pago sin tener que adivinarlo antes.
      notificationUrl: `${baseUrl()}/api/webhooks/mercadopago/${tenantSlug}`,
    };
  }
  if (process.env.MP_ACCESS_TOKEN) {
    return {
      accessToken: process.env.MP_ACCESS_TOKEN,
      notificationUrl: `${baseUrl()}/api/webhooks/mercadopago`,
    };
  }
  return null;
}

export interface PreferenceInput {
  orderId: string;
  tenantSlug: string;
  accessToken: string;
  notificationUrl: string;
  total: number;
  description: string;
  payer?: { name?: string; surname?: string; email?: string };
}

export interface PreferenceResult {
  id: string;
  initPoint: string;
}

// Fecha de expiración de la preferencia en el formato que espera MP
// (ISO 8601 con offset explícito, p. ej. 2025-01-01T12:00:00.000+00:00).
function expirationDateTo(): string {
  const ms = Date.now() + PHANTOM_ORDER_HOURS * 60 * 60 * 1000;
  return new Date(ms).toISOString().replace("Z", "+00:00");
}

export async function createPreference(
  input: PreferenceInput
): Promise<PreferenceResult> {
  const trackUrl = `${baseUrl()}/${input.tenantSlug}/pedido/${input.orderId}`;

  if (isMpMock()) {
    return {
      id: `MOCK-PREF-${input.orderId}`,
      initPoint: `${baseUrl()}/mock/mp/${input.orderId}`,
    };
  }

  const res = await fetch(`${MP_API}/checkout/preferences`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
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
      notification_url: input.notificationUrl,
      back_urls: { success: trackUrl, failure: trackUrl, pending: trackUrl },
      auto_return: "approved",
      // Pasada esta ventana el cliente ya no puede pagar; el pedido sin pagar
      // se auto-cancela (ver src/lib/phantom-orders.ts).
      expires: true,
      expiration_date_to: expirationDateTo(),
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
// convenio de `dataId`. En real, consulta GET /v1/payments/{id} con el access
// token del tenant dueño del pedido (propio o el global de respaldo — lo
// resuelve el caller, ver src/lib/payments/mercadopago-webhook.ts).
export async function fetchPaymentInfo(dataId: string, accessToken: string): Promise<MpPaymentInfo> {
  if (isMpMock() && dataId.startsWith("MOCK-")) {
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
    headers: { Authorization: `Bearer ${accessToken}` },
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
