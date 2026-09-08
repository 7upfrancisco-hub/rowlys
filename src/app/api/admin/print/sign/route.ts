import { NextResponse } from "next/server";
import crypto from "crypto";

// Firma para QZ Tray. Sin esto, QZ Tray muestra un cartel "Permitir / Bloquear"
// en cada impresión — inservible para el modo automático. Con el par
// certificado/clave configurado (env vars) las impresiones salen sin cortes.
//
// GET  -> devuelve el certificado público (QZ: setCertificatePromise).
// POST -> body = string a firmar; devuelve la firma base64 (QZ: setSignaturePromise).
//
// Protegido por middleware.ts (/api/admin/*): solo con sesión del local. Si no
// hay env vars, responde vacío y QZ cae al modo con confirmación manual.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const asText = (body: string, status = 200) =>
  new NextResponse(body, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });

// Vercel guarda los saltos de línea del PEM, pero por las dudas soportamos la
// variante con "\n" escapado.
const pem = (v: string | undefined) => (v ? v.replace(/\\n/g, "\n") : "");

export async function GET() {
  return asText(pem(process.env.QZ_CERT));
}

export async function POST(request: Request) {
  const key = pem(process.env.QZ_PRIVATE_KEY);
  if (!key) return asText("");

  const toSign = await request.text();
  try {
    const signature = crypto
      .createSign("RSA-SHA512")
      .update(toSign)
      .sign(key, "base64");
    return asText(signature);
  } catch (err) {
    console.error("QZ: la firma falló:", err);
    return asText("", 500);
  }
}
