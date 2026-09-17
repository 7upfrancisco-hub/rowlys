import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireTenantId } from "@/lib/tenant";

export const dynamic = "force-dynamic";

// Catálogo completo (mismo shape que la carta pública /api/<tenant>/menu),
// para el selector de productos de la carga/edición manual de pedidos desde
// /comanda. Antes estas pantallas llamaban por error a la API pública sin
// filtrar por tenant — con un solo local no se notaba, con más de uno
// mezclaba el catálogo de otro local en el picker del staff.
export async function GET(request: Request) {
  const tenantId = requireTenantId(request);

  const categories = await prisma.category.findMany({
    where: { tenantId },
    orderBy: { order: "asc" },
    include: {
      products: {
        where: { available: true },
        orderBy: { name: "asc" },
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
