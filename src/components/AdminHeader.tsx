import Link from "next/link";
import AdminNav from "@/components/AdminNav";
import LogoutButton from "@/components/LogoutButton";

// Header compartido por el panel (/admin/*) y la comanda. La marca "Blend" y
// los accesos Dashboard / Configuración / Cerrar sesión se ven IGUAL en las dos
// pantallas. `subtitle` (ej. "Comanda · N pedidos activos") y `extras`
// (campanita, botón de refrescar, hora de sincronización) son solo de la comanda.
// Nota: "Blend" es la marca del producto/panel — no confundir con el nombre
// del local (tenant) que se ve en el storefront del cliente, ej. "Rowlys".
export default function AdminHeader({
  subtitle,
  extras,
}: {
  subtitle?: React.ReactNode;
  extras?: React.ReactNode;
}) {
  return (
    <header className="border-b border-neutral-200 bg-white">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-6 py-4">
        <div className="flex items-baseline gap-2">
          <Link
            href="/admin"
            aria-label="Blend — ir al panel"
            className="text-xl font-extrabold tracking-tight text-brand-600"
          >
            Blend
          </Link>
          {subtitle}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-4 text-sm">
          {extras}
          <div className="flex items-center gap-1">
            <AdminNav />
            <LogoutButton />
          </div>
        </div>
      </div>
    </header>
  );
}
