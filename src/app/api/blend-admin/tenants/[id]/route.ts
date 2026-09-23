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

// `slug` es opcional a propósito: el toggle Activo/Inactivo de la tabla del
// dashboard solo manda `active`, sin tocar el resto.
const patchSchema = z.object({
  active: z.boolean().optional(),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(
      /^[a-z0-9]+(-[a-z0-9]+)*$/,
      "El slug solo puede tener minúsculas, números y guiones (ej. \"mi-local\")."
    )
    .optional(),
});

// Activar/desactivar un local (no borra nada) y, desde la Fase de detalle
// por tenant, también renombrar su slug — cambia la URL pública
// (blend.app/<slug>/menu) y NO deja redirección desde el slug viejo: si ya
// se repartieron QR o links con el slug anterior, dejan de servir. Pensado
// para corregir un slug mal elegido al crear el local (ej. quedó con un
// nombre provisorio), no para renombrar un local en producción con tráfico
// real sin avisar.
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

  const { active, slug } = parsed.data;
  if (slug && slug !== existing.slug) {
    const slugTaken = await prisma.tenant.findUnique({ where: { slug } });
    if (slugTaken) {
      return NextResponse.json({ error: "Ese slug ya está en uso." }, { status: 409 });
    }
  }

  const tenant = await prisma.tenant.update({
    where: { id: params.id },
    data: { ...(active !== undefined ? { active } : {}), ...(slug ? { slug } : {}) },
  });
  return NextResponse.json(tenant);
}
