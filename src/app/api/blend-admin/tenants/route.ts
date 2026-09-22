import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { OrderStatus } from "@/types";

export const dynamic = "force-dynamic";

// Mismo criterio de "facturable" que /api/admin/metrics (pedidos que el
// local aceptó). Se duplica acá (en vez de importar) porque es una cuenta
// chica y esta ruta vive en un árbol totalmente aparte (super-admin, no
// tenant) — no vale la pena acoplarlas todavía.
const BILLABLE: OrderStatus[] = ["CONFIRMED", "IN_PROGRESS", "READY", "DELIVERED"];
const AR_OFFSET_MS = 3 * 60 * 60 * 1000;

function arMonthStart(): Date {
  const now = new Date();
  const shifted = new Date(now.getTime() - AR_OFFSET_MS);
  return new Date(
    Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), 1, 3, 0, 0)
  );
}

// Lista todos los "clientes de Blend" con lo mínimo para decidir a quién
// cobrarle: pedidos y facturado del mes en curso. Protegido por
// middleware.ts (sesión de super-admin, no de tenant).
export async function GET() {
  const monthStart = arMonthStart();

  const [tenants, orders] = await Promise.all([
    prisma.tenant.findMany({
      orderBy: { createdAt: "asc" },
      include: {
        _count: { select: { users: true } },
        settings: { select: { mpUserId: true } },
      },
    }),
    prisma.order.findMany({
      where: { createdAt: { gte: monthStart }, tenantId: { not: null } },
      select: { tenantId: true, status: true, total: true },
    }),
  ]);

  const byTenant = new Map<string, { orders: number; revenue: number }>();
  for (const o of orders) {
    if (!o.tenantId || !BILLABLE.includes(o.status)) continue;
    const agg = byTenant.get(o.tenantId) ?? { orders: 0, revenue: 0 };
    agg.orders++;
    agg.revenue += o.total;
    byTenant.set(o.tenantId, agg);
  }

  const rows = tenants.map((t) => ({
    id: t.id,
    slug: t.slug,
    name: t.name,
    active: t.active,
    createdAt: t.createdAt.toISOString(),
    userCount: t._count.users,
    ordersThisMonth: byTenant.get(t.id)?.orders ?? 0,
    revenueThisMonth: byTenant.get(t.id)?.revenue ?? 0,
    mpUserId: t.settings?.mpUserId ?? null,
  }));

  return NextResponse.json(rows);
}

const createTenantSchema = z.object({
  name: z.string().trim().min(1, "Falta el nombre del local."),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(
      /^[a-z0-9]+(-[a-z0-9]+)*$/,
      "El slug solo puede tener minúsculas, números y guiones (ej. \"mi-local\")."
    ),
  username: z.string().trim().min(3, "El usuario debe tener al menos 3 caracteres."),
  password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres."),
});

// Alta de un local nuevo: crea el Tenant, su primer User (login) y su
// Settings, los tres en una transacción. Es el reemplazo del script ad hoc
// que se venía usando a mano (Fases 26a/26b) para cargar tenants.
export async function POST(request: Request) {
  const parsed = createTenantSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Datos inválidos." },
      { status: 400 }
    );
  }
  const { name, slug, username, password } = parsed.data;

  const [slugTaken, usernameTaken] = await Promise.all([
    prisma.tenant.findUnique({ where: { slug } }),
    prisma.user.findUnique({ where: { username } }),
  ]);
  if (slugTaken) {
    return NextResponse.json({ error: "Ese slug ya está en uso." }, { status: 409 });
  }
  if (usernameTaken) {
    return NextResponse.json({ error: "Ese usuario ya está en uso." }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  try {
    const tenant = await prisma.$transaction(async (tx) => {
      const t = await tx.tenant.create({ data: { slug, name } });
      await tx.user.create({ data: { tenantId: t.id, username, passwordHash } });
      await tx.settings.create({ data: { tenantId: t.id, storeName: name } });
      return t;
    });

    return NextResponse.json(
      { id: tenant.id, slug: tenant.slug, name: tenant.name },
      { status: 201 }
    );
  } catch (err) {
    // El chequeo de arriba (`slugTaken`/`usernameTaken`) tiene una ventana de
    // carrera: dos altas casi simultáneas con el mismo slug/usuario pueden
    // pasarlo las dos y chocar recién acá, contra la restricción única real
    // de la base. Sin este catch, esa carrera (poco común, pero posible con
    // un doble click) volvía un 500 genérico en vez del 409 prolijo de
    // siempre.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const target = (err.meta?.target as string[] | undefined) ?? [];
      const field = target.some((t) => t.includes("username")) ? "usuario" : "slug";
      return NextResponse.json(
        { error: `Ese ${field} ya está en uso.` },
        { status: 409 }
      );
    }
    throw err;
  }
}
