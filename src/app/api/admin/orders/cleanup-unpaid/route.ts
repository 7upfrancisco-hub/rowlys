import { NextResponse } from "next/server";
import {
  PHANTOM_ORDER_HOURS,
  countUnpaidOrders,
  sweepPhantomOrders,
} from "@/lib/phantom-orders";

export const dynamic = "force-dynamic";

// Protegido por middleware.ts (/api/admin/*).
//
// GET  -> contador para la UI ({ pending, stale, hours }).
// POST -> cancela ahora los pedidos MP sin pagar vencidos ({ cancelled }).

export async function GET() {
  const counts = await countUnpaidOrders();
  return NextResponse.json({ ...counts, hours: PHANTOM_ORDER_HOURS });
}

export async function POST() {
  const cancelled = await sweepPhantomOrders();
  return NextResponse.json({ cancelled });
}
