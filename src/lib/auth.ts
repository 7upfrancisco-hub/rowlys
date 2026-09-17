import { SignJWT, jwtVerify } from "jose";

// Sesión de un tenant (login de un local, /login -> /admin, /comanda).
export const SESSION_COOKIE = "rowlys_session";

export interface SessionPayload {
  // Username del User logueado (para mostrar/loguear, no para autorizar).
  sub: string;
  // Tenant al que pertenece ese User. Todo lo que la sesión puede ver/tocar
  // se scopea por esto (Fase 26b).
  tenantId: string;
}

// Sesión del super-admin de Blend (Fase 26c): cookie APARTE de la de tenant
// — a propósito, para que las dos convivan sin pisarse (podés estar logueado
// como Rowlys y como Blend al mismo tiempo, en el mismo navegador) y para
// que un bug en un sistema no filtre acceso al otro. Sigue validando contra
// ADMIN_USERNAME/ADMIN_PASSWORD_HASH (env vars), no contra la tabla `User`
// — esas credenciales son solo para los tenants.
export const SUPERADMIN_SESSION_COOKIE = "blend_admin_session";

export interface SuperAdminSessionPayload {
  sub: string;
}

function getSecretKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("Falta AUTH_SECRET en las variables de entorno.");
  }
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({ sub: payload.sub, tenantId: payload.tenantId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getSecretKey());
}

// Verifica la firma y devuelve el payload (o null si no hay token válido).
// Antes devolvía solo boolean — ahora hace falta leer tenantId para poder
// scopear cada query por el local correspondiente.
export async function verifySessionToken(
  token: string
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    if (typeof payload.sub !== "string" || typeof payload.tenantId !== "string") {
      return null;
    }
    return { sub: payload.sub, tenantId: payload.tenantId };
  } catch {
    return null;
  }
}

export async function createSuperAdminSessionToken(
  payload: SuperAdminSessionPayload
): Promise<string> {
  return new SignJWT({ sub: payload.sub, role: "SUPERADMIN" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getSecretKey());
}

export async function verifySuperAdminSessionToken(
  token: string
): Promise<SuperAdminSessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    if (typeof payload.sub !== "string" || payload.role !== "SUPERADMIN") {
      return null;
    }
    return { sub: payload.sub };
  } catch {
    return null;
  }
}

// "state" del OAuth de Mercado Pago (Conectar con Mercado Pago desde
// /blend-admin): viaja por una redirección de ida y vuelta a un sitio
// externo, así que no puede confiar en ninguna cookie — se firma el
// tenantId acá mismo, vida corta (alcanza y sobra para que alguien
// complete el login de Mercado Pago), y el callback lo verifica antes de
// guardar nada.
export async function createMpOAuthStateToken(tenantId: string): Promise<string> {
  return new SignJWT({ tenantId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(getSecretKey());
}

export async function verifyMpOAuthStateToken(token: string): Promise<{ tenantId: string } | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    if (typeof payload.tenantId !== "string") return null;
    return { tenantId: payload.tenantId };
  } catch {
    return null;
  }
}
