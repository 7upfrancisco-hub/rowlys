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

  // El checkout público crea pedidos sin sesión; todo lo demás (incluido GET
  // sobre esta misma ruta, que expone datos de clientes) requiere admin.
  if (request.method === "POST" && pathname === "/api/orders") {
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
