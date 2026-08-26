import LogoutButton from "@/components/LogoutButton";

export default function AdminPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-brand-600">Administración</h1>
        <LogoutButton />
      </div>
      <p className="text-neutral-500">
        Panel de administración en construcción: gestión de categorías,
        productos, pedidos y configuración del local.
      </p>
    </main>
  );
}
