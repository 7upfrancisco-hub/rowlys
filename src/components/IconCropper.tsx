"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const VIEWPORT_PX = 260; // tamaño en pantalla del recorte cuadrado
const OUTPUT_PX = 512; // resolución final del ícono exportado

interface Props {
  file: File;
  onCancel: () => void;
  onConfirm: (blob: Blob) => void;
}

// Editor mínimo para recortar una foto a cuadrado antes de usarla como ícono
// de la PWA (Fase 29 la generaba automática; esto es para cuando el local
// sube la suya). Arrastrar reposiciona, el slider hace zoom. Todo en canvas
// (nunca CSS transforms) para que el recorte final sea un cálculo directo de
// las mismas coordenadas que ya se están dibujando en la vista previa.
export default function IconCropper({ file, onCancel, onConfirm }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  // Pan en píxeles de la imagen ORIGINAL (no de pantalla), para que no
  // dependa de a qué resolución se dibuje la vista previa.
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => setImg(image);
    image.onerror = () => setError("No se pudo leer la imagen.");
    image.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Tamaño del recorte cuadrado en píxeles de la imagen ORIGINAL: al zoom
  // mínimo (1) es el lado corto entero; a más zoom, un cuadrado más chico
  // (más "acercado").
  const baseCropSize = img ? Math.min(img.naturalWidth, img.naturalHeight) : 0;
  const cropSize = baseCropSize / zoom;

  // Esquina superior-izquierda del recorte, centrada + el pan del usuario,
  // siempre clampeada para que el recorte no se salga de la imagen.
  const cropOrigin = useMemo(() => {
    if (!img) return { x: 0, y: 0 };
    const maxX = img.naturalWidth - cropSize;
    const maxY = img.naturalHeight - cropSize;
    const centerX = (img.naturalWidth - cropSize) / 2;
    const centerY = (img.naturalHeight - cropSize) / 2;
    return {
      x: Math.min(Math.max(centerX - pan.x, 0), Math.max(maxX, 0)),
      y: Math.min(Math.max(centerY - pan.y, 0), Math.max(maxY, 0)),
    };
  }, [img, cropSize, pan]);

  // Redibuja la vista previa cada vez que cambia el recorte.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // Fondo blanco antes de dibujar: si el logo tiene transparencia (fondo
    // "sin color"), que se vea como quedaría de verdad el ícono final —no
    // transparente/negro según el navegador.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, VIEWPORT_PX, VIEWPORT_PX);
    ctx.drawImage(
      img,
      cropOrigin.x,
      cropOrigin.y,
      cropSize,
      cropSize,
      0,
      0,
      VIEWPORT_PX,
      VIEWPORT_PX
    );
  }, [img, cropOrigin, cropSize]);

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
  }
  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const start = dragRef.current;
    if (!start || !img) return;
    // Convierte el desplazamiento en pantalla a píxeles de la imagen
    // original, para que el arrastre se sienta igual de "rápido" sin
    // importar el zoom.
    const scale = cropSize / VIEWPORT_PX;
    const dx = (e.clientX - start.x) * scale;
    const dy = (e.clientY - start.y) * scale;
    setPan({ x: start.panX + dx, y: start.panY + dy });
  }
  function onPointerUp() {
    dragRef.current = null;
  }

  function confirm() {
    if (!img) return;
    const out = document.createElement("canvas");
    out.width = OUTPUT_PX;
    out.height = OUTPUT_PX;
    const ctx = out.getContext("2d");
    if (!ctx) return;
    // Mismo fondo blanco que la vista previa — el WebP final nunca queda
    // con transparencia, sin importar si el logo original tenía o no.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, OUTPUT_PX, OUTPUT_PX);
    ctx.drawImage(
      img,
      cropOrigin.x,
      cropOrigin.y,
      cropSize,
      cropSize,
      0,
      0,
      OUTPUT_PX,
      OUTPUT_PX
    );
    out.toBlob(
      (blob) => {
        if (blob) onConfirm(blob);
      },
      "image/webp",
      0.85
    );
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/60 p-4">
      <div className="flex w-full max-w-sm flex-col items-center gap-4 rounded-2xl bg-white p-5 shadow-lg">
        <p className="self-start text-sm font-medium text-neutral-700">
          Ajustá tu foto — arrastrá para mover, deslizá para hacer zoom.
        </p>
        {error ? (
          <p className="text-sm text-red-600">{error}</p>
        ) : (
          <canvas
            ref={canvasRef}
            width={VIEWPORT_PX}
            height={VIEWPORT_PX}
            className="touch-none rounded-xl border border-neutral-200"
            style={{ width: VIEWPORT_PX, height: VIEWPORT_PX, cursor: "grab" }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
          />
        )}
        <input
          type="range"
          min={1}
          max={3}
          step={0.01}
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          className="w-full"
          aria-label="Zoom"
        />
        <div className="flex w-full justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={!img}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
          >
            Usar esta foto
          </button>
        </div>
      </div>
    </div>
  );
}
