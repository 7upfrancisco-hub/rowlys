import { NextResponse } from "next/server";
import {
  PHANTOM_ORDER_HOURS,
  countUnpaidOrders,
  sweepPhantomOrders,
} from "@/lib/phantom-orders";
import { requireTenantId } from "@/lib/tenant";

export const dynamic = "force-dynamic";

// Protegido por middleware.ts (/api/admin/*).
//
// GET  -> contador para la UI ({ pending, stale, hours }).
// POST -> cancela ahora los pedidos MP sin pagar vencidos ({ cancelled }).

export async function GET(request: Request) {
  const tenantId = requireTenantId(request);
  const counts = await countUnpaidOrders(tenantId);
  return NextResponse.json({ ...counts, hours: PHANTOM_ORDER_HOURS });
}

export async function POST(request: Request) {
  const tenantId = requireTenantId(request);
  const cancelled = await sweepPhantomOrders(tenantId);
  return NextResponse.json({ cancelled });
}
