import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const patchSchema = z.object({ active: z.boolean() });

// Por ahora solo activar/desactivar un local. Un tenant inactivo sigue
// existiendo con todos sus datos — no borra nada, es un toggle nomás (queda
// para más adelante decidir qué implica exactamente "inactivo" para el
// checkout/menú de ese local, la Fase 26c todavía no toca el storefront).
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Datos inválidos." },
      { status: 400 }
    );
  }

  const existing = await prisma.tenant.findUnique({ where: { id: params.id } });
  if (!existing) {
    return NextResponse.json({ error: "El local no existe." }, { status: 404 });
  }

  const tenant = await prisma.tenant.update({
    where: { id: params.id },
    data: { active: parsed.data.active },
  });
  return NextResponse.json(tenant);
}
