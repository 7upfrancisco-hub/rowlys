import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  verifySessionToken,
  verifySuperAdminSessionToken,
  SESSION_COOKIE,
  SUPERADMIN_SESSION_COOKIE,
} from "@/lib/auth";
import { TENANT_HEADER } from "@/lib/tenant";

export const config = {
  matcher: [
    "/admin/:path*",
    "/comanda/:path*",
    "/api/admin/:path*",
    "/api/orders/:path*",
    "/blend-admin/:path*",
    "/api/blend-admin/:path*",
  ],
};

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // El panel de super-admin de Blend (Fase 26c) es un sistema de auth
  // totalmente aparte del de cada tenant: cookie propia, sin tenantId, sin
  // relación con /login ni con la tabla User. Se resuelve primero y termina
  // acá — nunca cae al chequeo de sesión de tenant de abajo.
  if (pathname.startsWith("/blend-admin") || pathname.startsWith("/api/blend-admin")) {
    const isLoginRoute =
      pathname === "/blend-admin/login" || pathname === "/api/blend-admin/login";
    if (isLoginRoute) return NextResponse.next();

    const token = request.cookies.get(SUPERADMIN_SESSION_COOKIE)?.value;
    const session = token ? await verifySuperAdminSessionToken(token) : null;
    if (!session) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "No autorizado." }, { status: 401 });
      }
      const loginUrl = new URL("/blend-admin/login", request.url);
      loginUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.next();
  }

  // El seguimiento público de un pedido puntual (GET /api/orders/<id>, id no
  // adivinable) queda abierto. El listado GET /api/orders (sin id) sigue
  // protegido: expone PII de todos los clientes. La creación pública de
  // pedidos vive en /api/<tenant>/orders (Fase 26b-3), fuera del matcher de
  // este middleware — no pasa por acá.
  const isPublicOrderLookup =
    request.method === "GET" && /^\/api\/orders\/[^/]+$/.test(pathname);
  // Activar/desactivar notificaciones push desde /pedido/[id] (Fase 30):
  // mismo modelo de confianza que el lookup de arriba (id-cuid no adivinable
  // como token), pero con un segmento extra en el path.
  const isPublicPushSubscribe =
    (request.method === "POST" || request.method === "DELETE") &&
    /^\/api\/orders\/[^/]+\/push-subscribe$/.test(pathname);

  if (isPublicOrderLookup || isPublicPushSubscribe) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySessionToken(token) : null;

  if (!session) {
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

  // Propaga el tenant de la sesión a la route handler vía un header interno
  // (Fase 26b). Primero se borra cualquier valor que haya mandado el propio
  // cliente, para que nadie pueda falsear su tenant seteando el header a
  // mano — el único que lo escribe es este middleware, después de validar
  // la firma del JWT.
  const headers = new Headers(request.headers);
  headers.delete(TENANT_HEADER);
  headers.set(TENANT_HEADER, session.tenantId);
  return NextResponse.next({ request: { headers } });
}
