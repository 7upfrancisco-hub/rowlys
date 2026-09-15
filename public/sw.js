// Service worker mínimo, solo para que el storefront sea instalable como
// PWA. A propósito NO cachea páginas HTML ni respuestas de /api (el menú,
// los precios y el estado del pedido tienen que ser siempre datos frescos
// del servidor) — solo los assets estáticos versionados de Next
// (`/_next/static/...`, con hash en el nombre, seguros de cachear para
// siempre) y las imágenes subidas al local (`/uploads/...`).
const CACHE_NAME = "blend-static-v1";
const CACHEABLE_PREFIXES = ["/_next/static/", "/uploads/"];

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  if (!CACHEABLE_PREFIXES.some((p) => url.pathname.startsWith(p))) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(event.request);
      if (cached) return cached;
      const response = await fetch(event.request);
      if (response.ok) cache.put(event.request, response.clone());
      return response;
    })
  );
});
