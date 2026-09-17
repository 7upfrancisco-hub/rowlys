import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyMpOAuthStateToken } from "@/lib/auth";
import { exchangeCodeForToken } from "@/lib/payments/mercadopago";
import { encrypt } from "@/lib/crypto";
import { baseUrl } from "@/lib/base-url";

export const dynamic = "force-dynamic";

// Público a propósito (mismo criterio que /api/webhooks/mercadopago): no
// está en el matcher de middleware.ts. Mercado Pago redirige el navegador
// del dueño del local acá después de que autoriza — no hay cookie de sesión
// de super-admin ni de tenant que valga nada en ese momento, así que la
// única fuente de verdad es el `state` firmado por createMpOAuthStateToken
// en /api/blend-admin/tenants/[id]/mercadopago/connect.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const blendAdminUrl = new URL("/blend-admin", baseUrl());

  if (url.searchParams.get("error")) {
    // El dueño del local canceló la autorización en Mercado Pago.
    blendAdminUrl.searchParams.set("mpError", "cancelado");
    return NextResponse.redirect(blendAdminUrl);
  }

  if (!code || !state) {
    blendAdminUrl.searchParams.set("mpError", "faltan_parametros");
    return NextResponse.redirect(blendAdminUrl);
  }

  const verified = await verifyMpOAuthStateToken(state);
  if (!verified) {
    blendAdminUrl.searchParams.set("mpError", "state_invalido");
    return NextResponse.redirect(blendAdminUrl);
  }

  try {
    const tokens = await exchangeCodeForToken(code);
    await prisma.settings.update({
      where: { tenantId: verified.tenantId },
      data: {
        mpAccessToken: encrypt(tokens.accessToken),
        mpRefreshToken: encrypt(tokens.refreshToken),
        mpUserId: tokens.userId,
        mpTokenExpiresAt: new Date(Date.now() + tokens.expiresInSeconds * 1000),
        mpConnectedAt: new Date(),
      },
    });
    blendAdminUrl.searchParams.set("mpConnected", verified.tenantId);
  } catch (err) {
    console.error("Mercado Pago OAuth: fallo el intercambio de code:", err);
    blendAdminUrl.searchParams.set("mpError", "intercambio_fallo");
  }

  return NextResponse.redirect(blendAdminUrl);
}
