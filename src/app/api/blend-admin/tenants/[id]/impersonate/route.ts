import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createSessionToken, SESSION_COOKIE } from "@/lib/auth";

export const dynamic = "force-dynamic";

// "Entrar a este local" desde /blend-admin: le arma al super-admin una
// sesión de TENANT válida para soporte, sin necesitar la contraseña de ese
// local. Es la misma cookie que usa /login (rowlys_session) — createSessionToken
// no valida contra la tabla User, solo firma el payload, así que alcanza con
// conocer el tenantId (y esta ruta ya está protegida por middleware.ts como
// sesión de super-admin, no cualquiera puede pedirla).
export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: params.id },
    include: { users: { select: { username: true }, take: 1 } },
  });
  if (!tenant) {
    return NextResponse.json({ error: "El local no existe." }, { status: 404 });
  }

  const token = await createSessionToken({
    // Se identifica como soporte de Blend en el JWT (para que se distinga en
    // logs de un login real de ese local), no como el usuario real del tenant.
    sub: `blend-support:${tenant.users[0]?.username ?? tenant.slug}`,
    tenantId: tenant.id,
  });

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return response;
}
