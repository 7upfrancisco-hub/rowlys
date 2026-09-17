import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createMpOAuthStateToken } from "@/lib/auth";
import { buildAuthorizationUrl, isMpOAuthConfigured } from "@/lib/payments/mercadopago";

export const dynamic = "force-dynamic";

// Protegida por el matcher de sesión de super-admin (middleware.ts) —
// se navega acá con un click directo desde /blend-admin (no es un fetch:
// tiene que ser una navegación real de la ventana para que termine en la
// pantalla de autorización de Mercado Pago).
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  if (!isMpOAuthConfigured()) {
    return NextResponse.json(
      {
        error:
          "Mercado Pago OAuth no está configurado en este entorno (faltan MP_CLIENT_ID / MP_CLIENT_SECRET).",
      },
      { status: 503 }
    );
  }

  const tenant = await prisma.tenant.findUnique({ where: { id: params.id } });
  if (!tenant) {
    return NextResponse.json({ error: "El local no existe." }, { status: 404 });
  }

  const state = await createMpOAuthStateToken(tenant.id);
  return NextResponse.redirect(buildAuthorizationUrl(state));
}
