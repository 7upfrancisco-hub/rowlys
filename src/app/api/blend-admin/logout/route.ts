import { NextResponse } from "next/server";
import { SUPERADMIN_SESSION_COOKIE } from "@/lib/auth";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SUPERADMIN_SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}
