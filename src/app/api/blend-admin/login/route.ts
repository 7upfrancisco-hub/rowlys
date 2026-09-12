import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { createSuperAdminSessionToken, SUPERADMIN_SESSION_COOKIE } from "@/lib/auth";

interface LoginBody {
  username?: string;
  password?: string;
}

// Login del super-admin de Blend (Fase 26c) — sistema aparte del login de
// cada tenant (POST /api/auth/login). Valida contra ADMIN_USERNAME/
// ADMIN_PASSWORD_HASH (env vars), las mismas de siempre desde antes de la
// Fase 26b, reservadas para esto justamente para no mezclarse con la tabla
// `User` de los tenants.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as LoginBody;

  const expectedUsername = process.env.ADMIN_USERNAME;
  const expectedHash = process.env.ADMIN_PASSWORD_HASH;

  if (!expectedUsername || !expectedHash) {
    return NextResponse.json(
      { error: "El servidor no tiene configurado el super-admin." },
      { status: 500 }
    );
  }

  if (
    !body.username ||
    !body.password ||
    body.username !== expectedUsername ||
    !(await bcrypt.compare(body.password, expectedHash))
  ) {
    return NextResponse.json(
      { error: "Usuario o contraseña incorrectos." },
      { status: 401 }
    );
  }

  const token = await createSuperAdminSessionToken({ sub: body.username });
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SUPERADMIN_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return response;
}
