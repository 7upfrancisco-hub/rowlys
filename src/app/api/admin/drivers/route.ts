import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireTenantId } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const tenantId = requireTenantId(request);
  const drivers = await prisma.driver.findMany({
    where: { tenantId },
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });
  return NextResponse.json(drivers);
}

const createDriverSchema = z.object({
  name: z.string().trim().min(1, "Falta el nombre del repartidor."),
  phone: z.string().trim().min(1, "Falta el teléfono."),
  vehicle: z.string().trim().optional(),
  licensePlate: z.string().trim().optional(),
  documentId: z.string().trim().optional(),
  address: z.string().trim().optional(),
  notes: z.string().trim().optional(),
  active: z.boolean().optional(),
});

export async function POST(request: Request) {
  const tenantId = requireTenantId(request);
  const parsed = createDriverSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Datos inválidos." },
      { status: 400 }
    );
  }
  const driver = await prisma.driver.create({ data: { ...parsed.data, tenantId } });
  return NextResponse.json(driver, { status: 201 });
}
