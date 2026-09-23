import TenantDetailClient from "./tenant-detail-client";

export const dynamic = "force-dynamic";

export default function TenantDetailPage({
  params,
}: {
  params: { id: string };
}) {
  return <TenantDetailClient tenantId={params.id} />;
}
