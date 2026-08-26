import LogoutButton from "@/components/LogoutButton";

export default function ComandaPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-brand-600">
          Panel de comanda
        </h1>
        <LogoutButton />
      </div>
      <p className="text-neutral-500">
        Panel de cocina en construcción: acá vas a ver los pedidos entrantes y
        vas a poder avanzar su estado.
      </p>
    </main>
  );
}
