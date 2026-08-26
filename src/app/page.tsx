import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-8 px-6 py-12">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-brand-600">Rowlys</h1>
        <p className="mt-2 text-neutral-500">
          Menú digital y pedidos para retiro o delivery
        </p>
      </div>

      <Link
        href="/menu"
        className="rounded-lg bg-brand-600 px-4 py-3 text-center font-semibold text-white transition hover:bg-brand-700"
      >
        Ver menú y pedir
      </Link>

      <div className="flex justify-center gap-6 text-sm text-neutral-500">
        <Link href="/comanda" className="hover:text-brand-600 hover:underline">
          Panel de comanda (cocina)
        </Link>
        <Link href="/admin" className="hover:text-brand-600 hover:underline">
          Administración
        </Link>
      </div>
    </main>
  );
}
