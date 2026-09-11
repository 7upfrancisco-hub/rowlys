import Link from "next/link";
import ThemeToggle from "@/components/ThemeToggle";
import StorefrontTheme from "@/components/StorefrontTheme";

export const dynamic = "force-dynamic";

export default function HomePage() {
  return (
    <StorefrontTheme>
      <div className="storefront">
        <ThemeToggle />
        <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-8 px-6 py-12">
          <div className="text-center">
            <h1 className="text-3xl font-bold text-accent">Rowlys</h1>
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
