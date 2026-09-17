import type { Tenant } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// Resuelve el tenant de las rutas PÚBLICAS (/<slug>/menu, /api/<slug>/...) a
// partir del slug en la URL — el equivalente de requireTenantId() para
// páginas/APIs que no pasan por middleware.ts (ese header solo lo pone la
// sesión del panel admin). Un local inactivo se trata igual que uno
// inexistente: la carta no debe seguir siendo accesible.
export async function resolveTenantBySlug(slug: string): Promise<Tenant | null> {
  const tenant = await prisma.tenant.findUnique({ where: { slug } });
  if (!tenant || !tenant.active) return null;
  return tenant;
}
