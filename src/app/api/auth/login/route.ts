import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { createSessionToken, SESSION_COOKIE } from "@/lib/auth";

interface LoginBody {
  username?: string;
  password?: string;
}

// Login de un local (tenant), Fase 26b: valida contra la tabla `User`, ya no
// contra ADMIN_USERNAME/ADMIN_PASSWORD_HASH. Esas env vars quedan
// reservadas para el login del super-admin de Blend (panel aparte, Fase
// 26c) — no se tocan ni se leen acá, para no mezclar los dos sistemas.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as LoginBody;

  if (!body.username || !body.password) {
    return NextResponse.json(
      { error: "Usuario o contraseña incorrectos." },
      { status: 401 }
    );
  }

  const user = await prisma.user.findUnique({
    where: { username: body.username },
  });

  if (!user || !(await bcrypt.compare(body.password, user.passwordHash))) {
    return NextResponse.json(
      { error: "Usuario o contraseña incorrectos." },
      { status: 401 }
    );
  }

  const token = await createSessionToken({
    sub: user.username,
    tenantId: user.tenantId,
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
