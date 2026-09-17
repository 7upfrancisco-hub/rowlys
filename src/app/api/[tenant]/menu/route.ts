import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveTenantBySlug } from "@/lib/public-tenant";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: { tenant: string } }
) {
  const tenant = await resolveTenantBySlug(params.tenant);
  if (!tenant) {
    return NextResponse.json({ error: "Local no encontrado." }, { status: 404 });
  }

  const categories = await prisma.category.findMany({
    where: { tenantId: tenant.id },
    orderBy: { order: "asc" },
    include: {
      products: {
        // Un producto sin stock / desactivado no se muestra en la carta.
        where: { available: true },
        orderBy: { order: "asc" },
        include: {
          modifierGroups: {
            orderBy: { order: "asc" },
            include: {
              group: {
                include: {
                  options: { orderBy: { title: "asc" } },
                },
              },
            },
          },
        },
      },
    },
  });

  const result = categories
    // Una categoría sin productos visibles no aparece en la carta.
    .filter((category) => category.products.length > 0)
    .map((category) => ({
      ...category,
      products: category.products.map((product) => {
        const { modifierGroups, ...rest } = product;
        return {
          ...rest,
          modifierGroups: modifierGroups.map((pmg) => pmg.group),
        };
      }),
    }));

  return NextResponse.json(result);
}
