import { NextResponse } from "next/server";
import { createOrder, createOrderSchema } from "@/lib/orders";
import { resolveTenantBySlug } from "@/lib/public-tenant";

export const dynamic = "force-dynamic";

// Público (sin auth): creación de pedidos desde el checkout de /<tenant>/checkout.
export async function POST(
  request: Request,
  { params }: { params: { tenant: string } }
) {
  const tenant = await resolveTenantBySlug(params.tenant);
  if (!tenant) {
    return NextResponse.json({ error: "Local no encontrado." }, { status: 404 });
  }

  const parsed = createOrderSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Datos del pedido inválidos." },
      { status: 400 }
    );
  }

  const result = await createOrder(parsed.data, {
    enforceStoreStatus: true,
    enforceDeliveryZone: true,
    tenantId: tenant.id,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result.order, { status: 201 });
}
