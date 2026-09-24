import { notFound } from "next/navigation";
import type { Metadata } from "next";
import PedidoClient from "./pedido-client";
import StorefrontTheme from "@/components/StorefrontTheme";
import { resolveTenantBySlug } from "@/lib/public-tenant";

export const dynamic = "force-dynamic";

// Ver la nota en src/app/[tenant]/menu/page.tsx sobre por qué esto se enlaza
// a mano en vez de usar el archivo especial `manifest.ts` — y sobre por qué
// el título también se resuelve acá (nombre del local, no el fallback fijo
// "Rowlys" del layout raíz).
export async function generateMetadata({
  params,
}: {
  params: { tenant: string; id: string };
}): Promise<Metadata> {
  const tenant = await resolveTenantBySlug(params.tenant);
  return {
    title: tenant ? `${tenant.name} | Pedidos online` : undefined,
    manifest: `/${params.tenant}/manifest.webmanifest`,
  };
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
