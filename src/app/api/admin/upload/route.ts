import { NextResponse } from "next/server";
import { MAX_IMAGE_BYTES, storeProductImage } from "@/lib/blob";

// Subida de imágenes de productos. Protegido por `middleware.ts`
// (`/api/admin/:path*` exige sesión válida). Recibe `multipart/form-data` con
// un campo `file` (y opcionalmente `name` con el nombre original).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Se esperaba multipart/form-data." },
      { status: 400 }
    );
  }

  const file = form.get("file");
  if (!(file instanceof Blob) || file.size === 0) {
    return NextResponse.json(
      { error: "No se recibió ningún archivo." },
      { status: 400 }
    );
  }
  if (!file.type.startsWith("image/")) {
    return NextResponse.json(
      { error: "El archivo debe ser una imagen." },
      { status: 400 }
    );
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return NextResponse.json(
      {
        error: `La imagen supera el máximo de ${Math.round(
          MAX_IMAGE_BYTES / 1024 / 1024
        )} MB.`,
      },
      { status: 400 }
    );
  }

  const name = form.get("name");
  try {
    const stored = await storeProductImage(
      file,
      typeof name === "string" ? name : "imagen"
    );
    return NextResponse.json(stored, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: `No se pudo guardar la imagen: ${(err as Error).message}` },
      { status: 502 }
    );
  }
}
