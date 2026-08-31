import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isMpAvailable } from "@/lib/payments/mercadopago";

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
    storeOpen: true,
    deliveryEnabled: true,
    pickupEnabled: true,
    closedTitle: null,
    closedMessage: null,
    closedImageUrl: null,
  };

  return NextResponse.json({
    storeName: safe.storeName,
    storePhone: safe.storePhone,
    storeAddress: safe.storeAddress,
    deliveryFee: safe.deliveryFee,
    bankAlias: safe.bankAlias,
    storeOpen: safe.storeOpen,
    deliveryEnabled: safe.deliveryEnabled,
    pickupEnabled: safe.pickupEnabled,
    closedTitle: safe.closedTitle,
    closedMessage: safe.closedMessage,
    closedImageUrl: safe.closedImageUrl,
    // Deriva de env, no de la fila: el checkout solo ofrece MP si hay mock o
    // credenciales reales en este entorno.
    mpEnabled: isMpAvailable(),
  });
}
