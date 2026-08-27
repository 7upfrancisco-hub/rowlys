import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Publico (sin auth): pagina de seguimiento del pedido para el cliente final.
// El id (cuid) no es adivinable, por eso no requiere login (mismo modelo de
// confianza que un link de confirmacion de compra tipico).
export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const order = await prisma.order.findUnique({
    where: { id: params.id },
    include: { items: { include: { options: true } }, payment: true },
  });

  if (!order) {
    return NextResponse.json(
      { error: "Pedido no encontrado." },
      { status: 404 }
    );
  }

  return NextResponse.json(order);
}
