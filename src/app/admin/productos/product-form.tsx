"use client";

import { useState } from "react";
import { apiFetch, ApiError } from "@/lib/api-client";
import type { ModifierGroupDTO } from "@/types";

export interface AdminCategory {
  id: string;
  name: string;
}

// Achica la imagen en el navegador antes de subirla: máximo `maxDim` px de lado
// y re-encodeada a WebP. Deja los archivos en ~100-300 KB, así nunca choca con
// el límite de body de las funciones serverless y la carta carga liviana.
async function downscaleImage(
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

export interface AdminProduct {
  id: string;
  name: string;
  description: string | null;
  price: number;
  discountPrice: number | null;
  imageUrl: string | null;
  available: boolean;
  availableDelivery: boolean;
  availablePickup: boolean;
  categoryId: string;
  modifierGroups: ModifierGroupDTO[];
}

interface Props {
  categories: AdminCategory[];
  modifierGroups: ModifierGroupDTO[];
  initial: AdminProduct | null;
  onSaved: () => void;
  onCancel: () => void;
}

export default function ProductForm({
  categories,
  modifierGroups,
  initial,
  onSaved,
  onCancel,
}: Props) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [price, setPrice] = useState(initial?.price ?? 0);
  const [discountPrice, setDiscountPrice] = useState<string>(
    initial?.discountPrice != null ? String(initial.discountPrice) : ""
  );
  const [imageUrl, setImageUrl] = useState(initial?.imageUrl ?? "");
  const [categoryId, setCategoryId] = useState(
    initial?.categoryId ?? categories[0]?.id ?? ""
  );
  const [available, setAvailable] = useState(initial?.available ?? true);
  const [availableDelivery, setAvailableDelivery] = useState(
    initial?.availableDelivery ?? true
  );
  const [availablePickup, setAvailablePickup] = useState(
    initial?.availablePickup ?? true
  );
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>(
    initial?.modifierGroups.map((g) => g.id) ?? []
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState<string | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite volver a elegir el mismo archivo
    if (!file) return;
    setUploadErr(null);
    setUploading(true);
    try {
      const resized = await downscaleImage(file);
      const baseName = file.name.replace(/\.[^.]+$/, "") || "imagen";
      const fd = new FormData();
      fd.append("file", resized, `${baseName}.webp`);
      fd.append("name", file.name);
      const res = await fetch("/api/admin/upload", { method: "POST", body: fd });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "No se pudo subir la imagen.");
      setImageUrl(data.url as string);
    } catch (err) {
      setUploadErr((err as Error).message);
    } finally {
      setUploading(false);
    }
  }

  function toggleGroup(groupId: string) {
    setSelectedGroupIds((prev) =>
      prev.includes(groupId)
        ? prev.filter((id) => id !== groupId)
        : [...prev, groupId]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const base = {
        name,
        description: description.trim() || undefined,
        price,
        categoryId,
        available,
        availableDelivery,
        availablePickup,
        modifierGroupIds: selectedGroupIds,
      };
      if (initial) {
        await apiFetch(`/api/admin/products/${initial.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            ...base,
            discountPrice: discountPrice.trim() ? Number(discountPrice) : null,
            imageUrl: imageUrl.trim() || null,
          }),
        });
      } else {
        await apiFetch("/api/admin/products", {
          method: "POST",
          body: JSON.stringify({
            ...base,
            discountPrice: discountPrice.trim() ? Number(discountPrice) : undefined,
            imageUrl: imageUrl.trim() || undefined,
          }),
        });
      }
      onSaved();
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mb-8 flex flex-col gap-4 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm"
    >
      <h3 className="font-semibold text-neutral-900">
        {initial ? "Editar producto" : "Nuevo producto"}
      </h3>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-neutral-700">Nombre</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-lg border border-neutral-300 px-4 py-2 focus:border-brand-500 focus:outline-none"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-neutral-700">
            Categoría
          </label>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="rounded-lg border border-neutral-300 px-4 py-2 focus:border-brand-500 focus:outline-none"
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-neutral-700">
          Descripción
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="rounded-lg border border-neutral-300 px-4 py-2 focus:border-brand-500 focus:outline-none"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-neutral-700">
            Precio
          </label>
          <input
            type="number"
            step="0.01"
            value={price}
            onChange={(e) => setPrice(Number(e.target.value))}
            className="rounded-lg border border-neutral-300 px-4 py-2 focus:border-brand-500 focus:outline-none"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-neutral-700">
            Precio con descuento
          </label>
          <input
            type="number"
            step="0.01"
            value={discountPrice}
            onChange={(e) => setDiscountPrice(e.target.value)}
            placeholder="Opcional"
            className="rounded-lg border border-neutral-300 px-4 py-2 focus:border-brand-500 focus:outline-none"
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-neutral-700">Imagen</label>
        <div className="flex items-start gap-4">
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt=""
              className="h-24 w-24 shrink-0 rounded-lg border border-neutral-200 object-cover"
            />
          ) : (
            <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-lg border border-dashed border-neutral-300 text-center text-xs text-neutral-400">
              Sin imagen
            </div>
          )}
          <div className="flex flex-1 flex-col gap-2">
            <label
              className={
                "inline-flex w-fit cursor-pointer items-center rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 " +
                (uploading ? "pointer-events-none opacity-60" : "")
              }
            >
              <input
                type="file"
                accept="image/*"
                onChange={handleFile}
                className="hidden"
              />
              {uploading
                ? "Subiendo..."
                : imageUrl
                  ? "Cambiar imagen"
                  : "Subir imagen"}
            </label>
            {imageUrl && (
              <button
                type="button"
                onClick={() => setImageUrl("")}
                className="w-fit text-xs font-medium text-red-600 hover:underline"
              >
                Quitar imagen
              </button>
            )}
            {uploadErr && <p className="text-xs text-red-600">{uploadErr}</p>}
            <input
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="o pegá una URL: https://..."
              className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none"
            />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-6">
        <label className="flex items-center gap-2 text-sm text-neutral-700">
          <input
            type="checkbox"
            checked={available}
            onChange={(e) => setAvailable(e.target.checked)}
          />
          Activo
        </label>
        <label className="flex items-center gap-2 text-sm text-neutral-700">
          <input
            type="checkbox"
            checked={availableDelivery}
            onChange={(e) => setAvailableDelivery(e.target.checked)}
          />
          Disponible en delivery
        </label>
        <label className="flex items-center gap-2 text-sm text-neutral-700">
          <input
            type="checkbox"
            checked={availablePickup}
            onChange={(e) => setAvailablePickup(e.target.checked)}
          />
          Disponible en retiro
        </label>
      </div>

      {modifierGroups.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-medium text-neutral-700">
            Adicionales asignados
          </p>
          <div className="flex flex-wrap gap-4">
            {modifierGroups.map((group) => (
              <label
                key={group.id}
                className="flex items-center gap-2 text-sm text-neutral-700"
              >
                <input
                  type="checkbox"
                  checked={selectedGroupIds.includes(group.id)}
                  onChange={() => toggleGroup(group.id)}
                />
                {group.name}
              </label>
            ))}
          </div>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={saving || !name.trim() || !categoryId}
          className="rounded-lg bg-brand-600 px-4 py-2 font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
        >
          {initial ? "Guardar cambios" : "Crear producto"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-sm font-medium text-neutral-500 hover:underline"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
