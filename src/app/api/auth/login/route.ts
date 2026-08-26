import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { createSessionToken, SESSION_COOKIE } from "@/lib/auth";

interface LoginBody {
  username?: string;
  password?: string;
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as LoginBody;

  const expectedUsername = process.env.ADMIN_USERNAME;
  const expectedHash = process.env.ADMIN_PASSWORD_HASH;

  if (!expectedUsername || !expectedHash) {
    return NextResponse.json(
      { error: "El servidor no tiene configurado el usuario admin." },
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

  const token = await createSessionToken(body.username);
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
