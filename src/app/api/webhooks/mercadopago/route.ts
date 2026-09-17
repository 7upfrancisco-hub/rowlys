import { NextResponse } from "next/server";
import { isMpMock } from "@/lib/payments/mercadopago";
import { handleMercadoPagoWebhook } from "@/lib/payments/mercadopago-webhook";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Publico: lo llama Mercado Pago. No esta en el matcher de middleware.ts, asi
// que no pasa por auth.
//
// Legacy / respaldo transicional: esta es la URL de notificación que se le
// da a Mercado Pago cuando el pedido es de un tenant que TODAVÍA no conectó
// su propia cuenta (usa el MP_ACCESS_TOKEN global). Un local con cuenta
// propia conectada usa en cambio /api/webhooks/mercadopago/<slug>, que
// resuelve el token de ESE local en vez de este global — ver
// src/lib/payments/mercadopago.ts (resolvePaymentCredentials).
export async function GET() {
  return NextResponse.json({ ok: true });
}

export async function POST(request: Request) {
  // En mock, fetchPaymentInfo nunca llega a usar el token (corta antes por
  // el prefijo "MOCK-" del dataId) — cualquier string sirve.
  const accessToken = isMpMock() ? "mock" : process.env.MP_ACCESS_TOKEN;
  if (!accessToken) {
    // No debería pasar en la práctica (nadie pudo haber creado una
    // preferencia con este notification_url sin el token global), pero
    // evita un 500 feo si igual llega una notificación vieja.
    return NextResponse.json({ ignored: true, reason: "sin token global" });
  }
  return handleMercadoPagoWebhook(request, accessToken);
}
