import Link from "next/link";
import AdminNav from "@/components/AdminNav";
import LogoutButton from "@/components/LogoutButton";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          {/* Slot del logo de la app. Por ahora es un wordmark; cuando esté el
              logo real se reemplaza por <img src="/logo.svg" alt="Rowlys" />. */}
          <Link
            href="/admin"
            aria-label="Rowlys — ir al panel"
            className="text-xl font-extrabold tracking-tight text-brand-600"
          >
            Rowlys
          </Link>
          <nav className="flex flex-wrap items-center gap-1">
            <AdminNav />
            <LogoutButton />
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-10">{children}</main>
    </div>
  );
}
