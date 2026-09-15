export default function DescuentosPage() {
  return (
    <div>
      <h2 className="mb-1 text-2xl font-bold text-navy-900">Descuentos</h2>
      <p className="mb-6 max-w-xl text-sm text-neutral-600">
        Motor de descuentos automáticos (por ejemplo, un % off pagando con
        Transferencia) — todavía no está armado. Por ahora, para un precio
        rebajado en un producto puntual usá &quot;Precio con descuento&quot;
        desde{" "}
        <a href="/admin/productos" className="font-medium text-brand-600 hover:underline">
          Productos
        </a>
        .
      </p>
      <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-8 text-center text-sm text-neutral-400">
        Próximamente.
      </div>
    </div>
  );
}
