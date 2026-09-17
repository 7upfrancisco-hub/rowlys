"use client";

import { useEffect, useMemo, useRef, useState } from "react";

// Recorte/ajuste de imagen antes de subirla: el usuario arrastra para mover
// y desliza para hacer zoom dentro de un marco de proporción fija (`aspect`,
// ancho/alto). Al confirmar, exporta exactamente ese recorte como WebP —
// así lo que se ve acá es exactamente lo que va a mostrar la carta,
// independientemente de las proporciones de la foto original.
//
// Si no se pasa `aspect`, el marco se ajusta a la proporción NATURAL de la
// foto (acotada a un rango razonable de alto) para no forzar un recorte que
// no pidieron — pensado para fotos sueltas (personajes, logos) donde
// cualquier proporción fija cortaría partes de la imagen.

const FRAME_W = 320;
const MIN_FRAME_H = 160;
const MAX_FRAME_H = 480;
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const OUTPUT_W = 900;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

interface Props {
  file: File;
  aspect?: number; // ancho / alto, ej. 4/3. Si se omite, se ajusta a la foto.
  onCancel: () => void;
  onConfirm: (blob: Blob) => void;
}

export default function ImageCropModal({ file, aspect, onCancel, onConfirm }: Props) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [exporting, setExporting] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    panX: number;
    panY: number;
  } | null>(null);

  const rawAspect = aspect ?? (natural ? natural.w / natural.h : 1);
  const effectiveAspect = clamp(rawAspect, FRAME_W / MAX_FRAME_H, FRAME_W / MIN_FRAME_H);
  const frameH = Math.round(FRAME_W / effectiveAspect);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setObjectUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Con `aspect` fijo (fotos de producto, etc.) el marco siempre se llena
  // ("cover"): es un recorte a propósito. Sin `aspect` (fotos sueltas, ver
  // arriba) se ve la foto ENTERA por default ("contain") — el zoom queda
  // como ajuste opcional, nunca un recorte forzado de entrada.
  const scaleFit = useMemo(() => {
    if (!natural) return 0;
    const scaleW = FRAME_W / natural.w;
    const scaleH = frameH / natural.h;
    return aspect != null ? Math.max(scaleW, scaleH) : Math.min(scaleW, scaleH);
  }, [natural, frameH, aspect]);

  const displayedW = natural ? natural.w * scaleFit * zoom : 0;
  const displayedH = natural ? natural.h * scaleFit * zoom : 0;
  const maxPanX = Math.max(0, (displayedW - FRAME_W) / 2);
  const maxPanY = Math.max(0, (displayedH - frameH) / 2);

  // Si cambia el zoom (o recién carga la imagen), el rango de paneo válido
  // cambia — reencuadra el paneo actual dentro del nuevo límite.
  useEffect(() => {
    setPan((p) => ({
      x: clamp(p.x, -maxPanX, maxPanX),
      y: clamp(p.y, -maxPanY, maxPanY),
    }));
  }, [maxPanX, maxPanY]);

  function handlePointerDown(e: React.PointerEvent) {
    if (!natural) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      panX: pan.x,
      panY: pan.y,
    };
  }
  function handlePointerMove(e: React.PointerEvent) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    setPan({
      x: clamp(drag.panX + (e.clientX - drag.startX), -maxPanX, maxPanX),
      y: clamp(drag.panY + (e.clientY - drag.startY), -maxPanY, maxPanY),
    });
  }
  function handlePointerUp(e: React.PointerEvent) {
    if (dragRef.current?.pointerId === e.pointerId) dragRef.current = null;
  }

  const left = (FRAME_W - displayedW) / 2 + pan.x;
  const top = (frameH - displayedH) / 2 + pan.y;

  async function handleConfirm() {
    if (!natural || !imgRef.current) return;
    setExporting(true);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = OUTPUT_W;
      canvas.height = Math.round(OUTPUT_W / effectiveAspect);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("No se pudo generar el recorte.");

      if (aspect != null) {
        // Modo "cover" (frame fijo): recorta para llenar el marco exacto.
        const sourceScale = 1 / (scaleFit * zoom);
        const sw = FRAME_W * sourceScale;
        const sh = frameH * sourceScale;
        const sx = clamp(-left * sourceScale, 0, Math.max(0, natural.w - sw));
        const sy = clamp(-top * sourceScale, 0, Math.max(0, natural.h - sh));
        ctx.drawImage(imgRef.current, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
      } else {
        // Modo "contain" (formato libre): nunca recorta la foto en sí — la
        // dibuja entera donde el usuario la dejó posicionada (mover/zoom
        // siguen funcionando, pero a zoom 1 se ve completa). El resto del
        // canvas queda transparente.
        const outputScale = OUTPUT_W / FRAME_W;
        ctx.drawImage(
          imgRef.current,
          0,
          0,
          natural.w,
          natural.h,
          left * outputScale,
          top * outputScale,
          displayedW * outputScale,
          displayedH * outputScale
        );
      }

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/webp", 0.85)
      );
      if (!blob) throw new Error("No se pudo generar el recorte.");
      onConfirm(blob);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-neutral-200 bg-white p-6 shadow-xl">
        <h3 className="mb-1 font-semibold text-neutral-900">Ajustá la foto</h3>
        <p className="mb-4 text-xs text-neutral-500">
          Arrastrá para mover, deslizá para acercar. Así se va a ver en la
          carta.
        </p>

        <div
          className="mx-auto touch-none overflow-hidden rounded-lg border border-neutral-300 bg-neutral-100"
          style={{ width: FRAME_W, height: frameH, cursor: natural ? "grab" : "default" }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          {objectUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              ref={imgRef}
              src={objectUrl}
              alt=""
              draggable={false}
              onLoad={(e) => {
                const el = e.currentTarget;
                setNatural({ w: el.naturalWidth, h: el.naturalHeight });
                setZoom(MIN_ZOOM);
                setPan({ x: 0, y: 0 });
              }}
              style={
                natural
                  ? {
                      position: "relative",
                      left,
                      top,
                      width: displayedW,
                      height: displayedH,
                      maxWidth: "none",
                      userSelect: "none",
                    }
                  : { display: "none" }
              }
            />
          )}
          {!natural && (
            <div className="flex h-full items-center justify-center text-xs text-neutral-400">
              Cargando imagen...
            </div>
          )}
        </div>

        <div className="mt-4 flex items-center gap-3">
          <span className="text-xs text-neutral-500">Zoom</span>
          <input
            type="range"
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={0.01}
            value={zoom}
            disabled={!natural}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="flex-1"
          />
        </div>

        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!natural || exporting}
            className="rounded-lg bg-brand-600 px-4 py-2 font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
          >
            {exporting ? "Guardando..." : "Usar esta foto"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="text-sm font-medium text-neutral-500 hover:underline"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
