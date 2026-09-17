import { notFound } from "next/navigation";
import type { Metadata } from "next";
import PedidoClient from "./pedido-client";
import StorefrontTheme from "@/components/StorefrontTheme";
import { resolveTenantBySlug } from "@/lib/public-tenant";

export const dynamic = "force-dynamic";

// Ver la nota en src/app/[tenant]/menu/page.tsx sobre por qué esto se enlaza
// a mano en vez de usar el archivo especial `manifest.ts`.
export function generateMetadata({
  params,
}: {
  params: { tenant: string; id: string };
}): Metadata {
  return { manifest: `/${params.tenant}/manifest.webmanifest` };
}

export default async function PedidoPage({
  params,
}: {
  params: { tenant: string; id: string };
}) {
  const tenant = await resolveTenantBySlug(params.tenant);
  if (!tenant) notFound();

  return (
    <StorefrontTheme tenantId={tenant.id}>
      <PedidoClient id={params.id} tenantSlug={tenant.slug} />
    </StorefrontTheme>
  );
}
