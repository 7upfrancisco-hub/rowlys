import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/auth";

export const config = {
  matcher: [
    "/admin/:path*",
    "/comanda/:path*",
    "/api/admin/:path*",
    "/api/orders/:path*",
  ],
};

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // El checkout público crea pedidos sin sesión, y el seguimiento público de
  // un pedido puntual (GET /api/orders/<id>, id no adivinable) también queda
  // abierto. El listado GET /api/orders (sin id) sigue protegido: expone PII
  // de todos los clientes.
  const isPublicOrderCreate =
    request.method === "POST" && pathname === "/api/orders";
  const isPublicOrderLookup =
    request.method === "GET" && /^\/api\/orders\/[^/]+$/.test(pathname);

  if (isPublicOrderCreate || isPublicOrderLookup) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const valid = token ? await verifySessionToken(token) : false;

  if (!valid) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "No autorizado." },
        { status: 401 }
      );
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}
