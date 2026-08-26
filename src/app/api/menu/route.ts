import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const categories = await prisma.category.findMany({
    orderBy: { order: "asc" },
    include: {
      products: {
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

  const result = categories.map((category) => ({
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
