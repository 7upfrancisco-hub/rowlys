import { notFound } from "next/navigation";
import type { Metadata } from "next";
import CheckoutClient from "./checkout-client";
import StorefrontTheme from "@/components/StorefrontTheme";
import { resolveTenantBySlug } from "@/lib/public-tenant";

export const dynamic = "force-dynamic";

// Ver la nota en src/app/[tenant]/menu/page.tsx sobre por qué esto se enlaza
// a mano en vez de usar el archivo especial `manifest.ts`.
export function generateMetadata({
  params,
}: {
  params: { tenant: string };
}): Metadata {
  return { manifest: `/${params.tenant}/manifest.webmanifest` };
}

export default async function CheckoutPage({
  params,
}: {
  params: { tenant: string };
}) {
  const tenant = await resolveTenantBySlug(params.tenant);
  if (!tenant) notFound();

  return (
    <StorefrontTheme tenantId={tenant.id}>
      <CheckoutClient tenantSlug={tenant.slug} />
    </StorefrontTheme>
  );
}
