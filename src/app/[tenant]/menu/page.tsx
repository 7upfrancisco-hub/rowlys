import { notFound } from "next/navigation";
import type { Metadata } from "next";
import MenuClient from "./menu-client";
import StorefrontTheme from "@/components/StorefrontTheme";
import { resolveTenantBySlug } from "@/lib/public-tenant";

export const dynamic = "force-dynamic";

// El manifest por tenant no es el archivo especial `manifest.ts` de Next
// (no funciona dentro de un segmento dinámico, ver la route al lado del
// route.ts en manifest.webmanifest/) — se enlaza a mano acá.
export function generateMetadata({
  params,
}: {
  params: { tenant: string };
}): Metadata {
  return { manifest: `/${params.tenant}/manifest.webmanifest` };
}

export default async function MenuPage({
  params,
}: {
  params: { tenant: string };
}) {
  const tenant = await resolveTenantBySlug(params.tenant);
  if (!tenant) notFound();

  return (
    <StorefrontTheme tenantId={tenant.id}>
      <MenuClient tenantSlug={tenant.slug} />
    </StorefrontTheme>
  );
}
