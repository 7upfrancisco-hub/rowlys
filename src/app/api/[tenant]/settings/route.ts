import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isMpAvailableForTenant } from "@/lib/payments/mercadopago";
import { resolveTenantBySlug } from "@/lib/public-tenant";

export const dynamic = "force-dynamic";

// Publico (sin auth): solo expone el subconjunto de Settings que el
// cliente final necesita para el checkout (costo de envio, alias bancario,
// datos de contacto del local). Whitelist explicita, nunca spread de la fila
// completa, para que un campo nuevo agregado a futuro no se filtre solo.
export async function GET(
  request: Request,
  { params }: { params: { tenant: string } }
) {
  const tenant = await resolveTenantBySlug(params.tenant);
  if (!tenant) {
    return NextResponse.json({ error: "Local no encontrado." }, { status: 404 });
  }

  const settings = await prisma.settings.findUnique({
    where: { tenantId: tenant.id },
  });

  const safe = settings ?? {
    storeName: tenant.name,
    storePhone: null,
    storeAddress: null,
    instagramHandle: null,
    tiktokHandle: null,
    deliveryFee: 0,
    bankAlias: null,
    storeOpen: true,
    deliveryEnabled: true,
    pickupEnabled: true,
    cashEnabled: true,
    bankTransferEnabled: true,
    closedTitle: null,
    closedMessage: null,
    closedImageUrl: null,
    prepTimeDeliveryMinutes: 10,
    prepTimePickupMinutes: 10,
    coverImageUrl: null,
    iconUrl: null,
    footerImageLeftUrl: null,
    footerImageRightUrl: null,
    footerColor: null,
  };

  return NextResponse.json({
    storeName: safe.storeName,
    storePhone: safe.storePhone,
    storeAddress: safe.storeAddress,
    instagramHandle: safe.instagramHandle,
    tiktokHandle: safe.tiktokHandle,
    deliveryFee: safe.deliveryFee,
    bankAlias: safe.bankAlias,
    storeOpen: safe.storeOpen,
    deliveryEnabled: safe.deliveryEnabled,
    pickupEnabled: safe.pickupEnabled,
    cashEnabled: safe.cashEnabled,
    bankTransferEnabled: safe.bankTransferEnabled,
    closedTitle: safe.closedTitle,
    closedMessage: safe.closedMessage,
    closedImageUrl: safe.closedImageUrl,
    prepTimeDeliveryMinutes: safe.prepTimeDeliveryMinutes,
    prepTimePickupMinutes: safe.prepTimePickupMinutes,
    coverImageUrl: safe.coverImageUrl,
    iconUrl: safe.iconUrl,
    footerImageLeftUrl: safe.footerImageLeftUrl,
    footerImageRightUrl: safe.footerImageRightUrl,
    footerColor: safe.footerColor,
    // El checkout solo ofrece MP si hay mock, el local conectó su propia
    // cuenta, o hay token global de respaldo.
    mpEnabled: await isMpAvailableForTenant(tenant.id),
  });
}
