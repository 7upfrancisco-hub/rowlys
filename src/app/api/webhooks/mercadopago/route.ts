import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  fetchPaymentInfo,
  mapMpStatus,
  verifyWebhookSignature,
} from "@/lib/payments/mercadopago";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Publico: lo llama Mercado Pago. No esta en el matcher de middleware.ts, asi
// que no pasa por auth. Se responde 200 siempre que la notificacion se haya
// procesado (o se pueda ignorar): un no-2xx hace que MP reintente.
//
// MP manda `type`/`topic` y el id en `data.id` (body JSON) o en la query
// (`?type=payment&data.id=123`). Solo nos interesa `payment`. El matcheo con el
// pedido es por `external_reference` (= order.id), que viene en el pago, no en
// la notificacion, por eso hay que consultarlo.
export async function GET() {
  return NextResponse.json({ ok: true });
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const body = (await request.json().catch(() => ({}))) as {
    type?: string;
    topic?: string;
    action?: string;
    data?: { id?: string | number };
  };

  const type = body.type ?? body.topic ?? url.searchParams.get("type") ?? "";
  const dataId = String(
    body.data?.id ??
      url.searchParams.get("data.id") ??
      url.searchParams.get("id") ??
      ""
  );

  // MP tambien manda notificaciones de merchant_order y otros; se ignoran (200).
  if (type !== "payment" || !dataId) {
    return NextResponse.json({ ignored: true });
  }

  const signatureOk = verifyWebhookSignature({
    signatureHeader: request.headers.get("x-signature"),
    requestId: request.headers.get("x-request-id"),
    dataId,
  });
  if (!signatureOk) {
    return NextResponse.json({ error: "Firma invalida." }, { status: 401 });
  }

  let info;
  try {
    info = await fetchPaymentInfo(dataId);
  } catch (err) {
    // No pudimos resolver el pago ahora: 502 para que MP reintente mas tarde.
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "No se pudo consultar el pago.",
      },
      { status: 502 }
    );
  }

  if (!info.externalReference) {
    return NextResponse.json({ ignored: true, reason: "sin external_reference" });
  }

  const payment = await prisma.payment.findUnique({
    where: { orderId: info.externalReference },
  });
  if (!payment || payment.provider !== "MP") {
    return NextResponse.json({ ignored: true, reason: "pedido no es MP" });
  }

  const nextStatus = mapMpStatus(info.status);

  // Idempotente: si ya esta en el estado final, no se re-escribe.
  if (payment.status === nextStatus) {
    return NextResponse.json({ ok: true, status: nextStatus, unchanged: true });
  }
  // No degradar un pago ya confirmado por una notificacion tardia.
  if (payment.status === "CONFIRMED" && nextStatus !== "CONFIRMED") {
    return NextResponse.json({ ok: true, status: "CONFIRMED", kept: true });
  }

  await prisma.payment.update({
    where: { orderId: info.externalReference },
    data: {
      status: nextStatus,
      providerRef: info.id,
      rawPayload: JSON.stringify(info.raw).slice(0, 8000),
    },
  });

  return NextResponse.json({ ok: true, status: nextStatus });
}
