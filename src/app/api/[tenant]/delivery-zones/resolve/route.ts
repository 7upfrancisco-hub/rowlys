import { NextResponse } from "next/server";
import { resolveTenantBySlug } from "@/lib/public-tenant";
import { prisma } from "@/lib/prisma";
import { resolveDeliveryFee } from "@/lib/orders";

export const dynamic = "force-dynamic";

// Público (sin auth): usado por el checkout para mostrar la tarifa real (o
// avisar que la dirección queda fuera de zona) apenas el cliente elige su
// dirección en el autocompletar, antes de mandar el pedido. La validación
// que realmente importa se repite en el server al crear el pedido — esto es
// solo para no dejarlo enterarse recién al confirmar.
export async function GET(
  request: Request,
  { params }: { params: { tenant: string } }
) {
  const tenant = await resolveTenantBySlug(params.tenant);
  if (!tenant) {
    return NextResponse.json({ error: "Local no encontrado." }, { status: 404 });
  }

  const url = new URL(request.url);
  const lat = Number(url.searchParams.get("lat"));
  const lng = Number(url.searchParams.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "Faltan coordenadas." }, { status: 400 });
  }

  const settings = await prisma.settings.findUnique({
    where: { tenantId: tenant.id },
  });

  const result = await resolveDeliveryFee(
    tenant.id,
    { lat, lng },
    settings?.deliveryFee ?? 0,
    true
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ fee: result.fee, zoneName: result.zoneName });
}
