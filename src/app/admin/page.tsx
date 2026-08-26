import Link from "next/link";

const SECTIONS = [
  {
    href: "/admin/pedidos",
    title: "Pedidos",
    description: "Ver pedidos entrantes, cambiar su estado y marcar cobrados.",
  },
  {
    href: "/admin/categorias",
    title: "Categorías",
    description: "Organizar la carta en categorías y su orden de aparición.",
  },
  {
    href: "/admin/productos",
    title: "Productos",
    description: "Cargar productos, precios, descuentos y canal de venta.",
  },
  {
    href: "/admin/adicionales",
    title: "Adicionales",
    description: "Grupos de opciones (guarniciones, salsas, quitar ingredientes).",
  },
  {
    href: "/admin/configuracion",
    title: "Configuración",
    description: "Datos del local, costo de envío y alias bancario.",
  },
];

export default function AdminPage() {
  return (
    <div>
      <h2 className="mb-6 text-2xl font-bold text-neutral-900">
        Administración
      </h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SECTIONS.map((section) => (
          <Link
            key={section.href}
            href={section.href}
            className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm transition hover:border-brand-300 hover:shadow-md"
          >
            <h3 className="mb-1 font-semibold text-brand-600">
              {section.title}
            </h3>
            <p className="text-sm text-neutral-500">{section.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
