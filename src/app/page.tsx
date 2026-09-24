import Link from "next/link";
import ThemeToggle from "@/components/ThemeToggle";
import StorefrontTheme from "@/components/StorefrontTheme";
import InstallPwa from "@/components/InstallPwa";
import { resolveTenantBySlug } from "@/lib/public-tenant";

export const dynamic = "force-dynamic";

// Home todavía single-tenant a propósito (funcionalmente sigue apuntando al
// tenant "rowlys" — /menu, /comanda y /admin abajo son SU carta y SU login,
// vía los redirects de next.config.mjs): el directorio público de Blend con
// todos los tenants activos es una fase aparte (Fase 26d en
// PROJECT_MEMORY.md), no bloqueante para que cada local funcione bien en su
// propio /<slug>/menu. Lo que sí se corrigió (2026-09-23): la marca que se
// MUESTRA acá es "Blend" (el producto), no "Rowlys" (un cliente) — antes
// decía "Rowlys" a secas, mezclando las dos cosas.
export default async function HomePage() {
  const tenant = await resolveTenantBySlug("rowlys");

  return (
    <StorefrontTheme tenantId={tenant?.id ?? ""}>
      <div className="storefront">
        <ThemeToggle />
        <InstallPwa />
        <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-8 px-6 py-12">
          <div className="text-center">
            <h1 className="text-3xl font-bold text-accent">Blend</h1>
            <p className="mt-2 text-muted">
              Menú digital y pedidos para retiro o delivery
            </p>
          </div>

          <Link
            href="/menu"
            className="rounded-lg bg-accent-solid px-4 py-3 text-center font-semibold text-on-accent transition hover:bg-accent-solid-hover"
          >
            Ver menú y pedir
          </Link>

          <div className="flex justify-center gap-6 text-sm text-muted">
            <Link href="/comanda" className="hover:text-accent hover:underline">
              Panel de comanda (cocina)
            </Link>
            <Link href="/admin" className="hover:text-accent hover:underline">
              Administración
            </Link>
          </div>
        </main>
      </div>
    </StorefrontTheme>
  );
}
