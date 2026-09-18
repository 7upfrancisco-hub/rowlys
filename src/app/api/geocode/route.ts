import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Proxy a Nominatim (geocoding gratis de OpenStreetMap) para el autocompletar
// de dirección del checkout y el buscador del mapa de zonas en el admin. Se
// hace desde el server (no directo desde el navegador) porque la política de
// uso de Nominatim pide un User-Agent identificando la app — algo que fetch
// del navegador no puede setear — y de paso evita pegarle a su API más rápido
// de lo que permite (max ~1 req/seg) sin importar cuántos clientes la usen.
const USER_AGENT = "Blend (sistema de pedidos, contacto: soporte@blend.app)";

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.trim();
  if (!q || q.length < 3) {
    return NextResponse.json([]);
  }

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", q);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "0");
  url.searchParams.set("limit", "5");
  // Sin esto Nominatim tira resultados de cualquier país; nuestros locales
  // son todos de Argentina.
  url.searchParams.set("countrycodes", "ar");

  let res: Response;
  try {
    res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  } catch {
    return NextResponse.json(
      { error: "No se pudo buscar la dirección." },
      { status: 502 }
    );
  }
  if (!res.ok) {
    return NextResponse.json(
      { error: "No se pudo buscar la dirección." },
      { status: 502 }
    );
  }

  const raw = (await res.json()) as Array<{
    display_name: string;
    lat: string;
    lon: string;
  }>;
  const results = raw.map((r) => ({
    address: r.display_name,
    lat: Number(r.lat),
    lng: Number(r.lon),
  }));
  return NextResponse.json(results);
}
