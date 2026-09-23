import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Detalle de un local para /blend-admin/tenants/[id]: datos de contacto,
// usuarios (sin passwordHash — la contraseña nunca sale del server, ni
// siquiera hasheada, no hay motivo para exponerla) y un resumen del menú.
// Nunca incluye mpAccessToken/mpRefreshToken (mismo criterio que
// /api/admin/settings desde la corrección de la revisión general).
export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: params.id },
    include: {
      users: {
        select: { id: true, username: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      },
      settings: {
        select: {
          storePhone: true,
          storeAddress: true,
          instagramHandle: true,
          tiktokHandle: true,
          bankAlias: true,
        },
      },
    },
  });
  if (!tenant) {
    return NextResponse.json({ error: "El local no existe." }, { status: 404 });
  }

  const [categoryCount, productCount, customerCount] = await Promise.all([
    prisma.category.count({ where: { tenantId: tenant.id } }),
    prisma.product.count({ where: { tenantId: tenant.id } }),
    prisma.customer.count({ where: { tenantId: tenant.id } }),
  ]);

  return NextResponse.json({
    id: tenant.id,
    slug: tenant.slug,
    name: tenant.name,
    active: tenant.active,
    createdAt: tenant.createdAt,
    users: tenant.users,
    settings: tenant.settings,
    menu: { categoryCount, productCount },
    customerCount,
  });
}

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
