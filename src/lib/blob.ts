import { promises as fs } from "fs";
import path from "path";
import { put } from "@vercel/blob";

// Almacenamiento de imágenes de productos. Server-only.
//
// - Con `BLOB_READ_WRITE_TOKEN` en el entorno (Vercel lo inyecta solo cuando el
//   proyecto tiene un Blob store vinculado): sube a Vercel Blob.
// - Sin token (dev local): la escribe en `public/uploads/` y devuelve una ruta
//   relativa `/uploads/<archivo>`. Solo sirve en dev — en un build de prod
//   `public/` es de solo lectura y además Vercel tiene filesystem efímero, por
//   eso ahí hace falta sí o sí el token.

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export function isBlobConfigured(): boolean {
  return !!process.env.BLOB_READ_WRITE_TOKEN;
}

const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};

function pickExt(type: string, originalName: string): string {
  if (EXT_BY_TYPE[type]) return EXT_BY_TYPE[type];
  const m = originalName.toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : "bin";
}

// Guarda la imagen y devuelve su URL pública (absoluta con Blob, relativa en
// el fallback de dev).
export async function storeProductImage(
  file: Blob,
  originalName: string
): Promise<{ url: string }> {
  const ext = pickExt(file.type, originalName);
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  if (isBlobConfigured()) {
    const blob = await put(`productos/${stamp}.${ext}`, file, {
      access: "public",
      contentType: file.type || undefined,
    });
    return { url: blob.url };
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const dir = path.join(process.cwd(), "public", "uploads");
  await fs.mkdir(dir, { recursive: true });
  const fname = `producto-${stamp}.${ext}`;
  await fs.writeFile(path.join(dir, fname), buf);
  return { url: `/uploads/${fname}` };
}
