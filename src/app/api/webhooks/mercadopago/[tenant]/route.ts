import { NextResponse } from "next/server";
import { getOwnAccessToken } from "@/lib/payments/mercadopago";
import { handleMercadoPagoWebhook } from "@/lib/payments/mercadopago-webhook";
import { resolveTenantBySlug } from "@/lib/public-tenant";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Publico: lo llama Mercado Pago. No esta en el matcher de middleware.ts
// (mismo criterio que la legacy /api/webhooks/mercadopago), y el slug en la
// URL viene de nosotros mismos (lo pusimos al armar la preferencia) — no es
// un dato que haya que validar contra sesión alguna, solo para saber con
// qué access token propio pedirle el detalle del pago a Mercado Pago.
export async function GET() {
  return NextResponse.json({ ok: true });
}

export async function POST(
  request: Request,
  { params }: { params: { tenant: string } }
) {
  const tenant = await resolveTenantBySlug(params.tenant);
  if (!tenant) {
    return NextResponse.json({ ignored: true, reason: "local no encontrado" });
  }

  const accessToken = await getOwnAccessToken(tenant.id);
  if (!accessToken) {
    // El local desconectó su cuenta después de crear la preferencia — no
    // hay con qué token consultar el pago.
    return NextResponse.json({ ignored: true, reason: "sin cuenta de MP conectada" });
  }

  return handleMercadoPagoWebhook(request, accessToken);
}
