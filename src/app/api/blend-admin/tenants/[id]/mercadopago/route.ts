import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Desconecta la cuenta de Mercado Pago de un local: borra nuestra copia de
// los tokens. Mercado Pago no ofrece una revocación remota simple para este
// flujo — el local puede revocarla del todo desde "Tus aplicaciones
// autorizadas" en su propia cuenta. Después de esto, ese local vuelve a
// cobrar con el MP_ACCESS_TOKEN global (si existe).
export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  const settings = await prisma.settings.findUnique({ where: { tenantId: params.id } });
  if (!settings) {
    return NextResponse.json({ error: "El local no existe." }, { status: 404 });
  }

  await prisma.settings.update({
    where: { tenantId: params.id },
    data: {
      mpAccessToken: null,
      mpRefreshToken: null,
      mpUserId: null,
      mpTokenExpiresAt: null,
      mpConnectedAt: null,
    },
  });

  return NextResponse.json({ ok: true });
}
