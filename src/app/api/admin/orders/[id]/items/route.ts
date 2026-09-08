import { NextResponse } from "next/server";
import { editOrderItemsSchema, updateOrderItems } from "@/lib/orders";

export const dynamic = "force-dynamic";

// Editar los ítems (y la nota) de un pedido en curso desde /comanda.
// Protegido por middleware.ts (/api/admin/*). Recalcula total y monto del pago.
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const parsed = editOrderItemsSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Datos inválidos." },
      { status: 400 }
    );
  }

  const result = await updateOrderItems(params.id, parsed.data);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result.order);
}
