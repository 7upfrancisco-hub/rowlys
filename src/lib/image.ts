// Helpers de imagen del lado del cliente (canvas). Se usan antes de subir a
// `/api/admin/upload` para que los archivos queden livianos y uniformes.

// Achica la imagen: máximo `maxDim` px de lado, re-encodeada a WebP. Deja los
// archivos en ~100-300 KB, así nunca chocan con el límite de body de las
// funciones serverless y todo carga liviano.
export async function downscaleImage(
  file: File,
  maxDim = 1200,
  quality = 0.82
): Promise<Blob> {
  const dataUrl = await new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = () => rej(new Error("No se pudo leer el archivo."));
    r.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error("El archivo no es una imagen válida."));
    i.src = dataUrl;
  });

  let { width, height } = img;
  if (width > maxDim || height > maxDim) {
    const scale = maxDim / Math.max(width, height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file; // sin canvas: subimos el original tal cual
  ctx.drawImage(img, 0, 0, width, height);

  const blob = await new Promise<Blob | null>((res) =>
    canvas.toBlob(res, "image/webp", quality)
  );
  return blob ?? file;
}

// Sube una imagen (ya achicada) a /api/admin/upload y devuelve la URL pública.
// Lanza Error con el mensaje del server si algo falla.
export async function uploadImage(blob: Blob, originalName: string): Promise<string> {
  const base = originalName.replace(/\.[^.]+$/, "") || "imagen";
  const fd = new FormData();
  fd.append("file", blob, `${base}.webp`);
  fd.append("name", originalName);
  const res = await fetch("/api/admin/upload", { method: "POST", body: fd });
  const data = (await res.json().catch(() => null)) as { url?: string; error?: string } | null;
  if (!res.ok || !data?.url) {
    throw new Error(data?.error ?? "No se pudo subir la imagen.");
  }
  return data.url;
}
