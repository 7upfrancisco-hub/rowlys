/** @type {import('next').NextConfig} */
const nextConfig = {
  // La carta pública vive ahora bajo /<slug>/menu, /<slug>/checkout,
  // /<slug>/pedido/<id> (Fase 26b-3, multi-tenant real). Estos redirects
  // mantienen andando todo lo que ya apunta a las rutas viejas sin slug —
  // QR/links ya impresos y la PWA ya instalada en celulares de clientes de
  // Rowlys (start_url: "/menu") — asumiendo Rowlys como default. No
  // permanentes (307): si el día de mañana el default cambia, no queda
  // cacheado para siempre en el navegador.
  async redirects() {
    return [
      { source: "/menu", destination: "/rowlys/menu", permanent: false },
      { source: "/checkout", destination: "/rowlys/checkout", permanent: false },
      { source: "/pedido/:id", destination: "/rowlys/pedido/:id", permanent: false },
    ];
  },
};

export default nextConfig;
