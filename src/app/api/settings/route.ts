import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Endpoint publico (sin auth): solo expone el subconjunto de Settings que el
// cliente final necesita para el checkout (costo de envio, alias bancario,
// datos de contacto del local). Whitelist explicita, nunca spread de la fila
// completa, para que un campo nuevo agregado a futuro no se filtre solo.
export async function GET() {
  const settings = await prisma.settings.findUnique({
    where: { id: "singleton" },
  });

  const safe = settings ?? {
    storeName: "Rowlys",
    storePhone: null,
    storeAddress: null,
    deliveryFee: 0,
    bankAlias: null,
  };

  return NextResponse.json({
    storeName: safe.storeName,
    storePhone: safe.storePhone,
    storeAddress: safe.storeAddress,
    deliveryFee: safe.deliveryFee,
    bankAlias: safe.bankAlias,
  });
}
