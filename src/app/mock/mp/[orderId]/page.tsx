import { notFound } from "next/navigation";
import { isMpMock } from "@/lib/payments/mercadopago";
import MockMpClient from "./mock-mp-client";

export const dynamic = "force-dynamic";

// Simulador del checkout de Mercado Pago para desarrollo. Solo existe cuando
// MP esta en modo mock (sin cuenta real / sin tunel para el webhook). En
// produccion con credenciales reales devuelve 404.
export default function MockMpPage({
  params,
}: {
  params: { orderId: string };
}) {
  if (!isMpMock()) notFound();
  return <MockMpClient orderId={params.orderId} />;
}
