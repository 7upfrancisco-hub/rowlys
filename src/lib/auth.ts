import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "rowlys_session";

export interface SessionPayload {
  // Username del User logueado (para mostrar/loguear, no para autorizar).
  sub: string;
  // Tenant al que pertenece ese User. Todo lo que la sesión puede ver/tocar
  // se scopea por esto (Fase 26b).
  tenantId: string;
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
