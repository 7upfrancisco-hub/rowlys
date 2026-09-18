"use client";

import { useEffect, useRef, useState } from "react";
import { loadGoogleMaps } from "@/lib/google-maps";
import type { LatLng } from "@/lib/geo";

interface Props {
  value: LatLng[] | null;
  onChange: (polygon: LatLng[] | null) => void;
  // Centro inicial del mapa (ej. dirección del local ya geocodificada). Sin
  // esto, arranca centrado en Buenos Aires como referencia genérica.
  center?: LatLng;
}

const DEFAULT_CENTER: LatLng = { lat: -34.6037, lng: -58.3816 };

// Editor de polígono sobre Google Maps: clic para agregar una esquina,
// arrastrar un punto existente para ajustarlo. `value`/`onChange` son la
// única fuente de verdad — el polígono de Maps solo la refleja.
export default function DeliveryZoneMap({ value, onChange, center }: Props) {
  const mapDivRef = useRef<HTMLDivElement>(null);
  const polygonRef = useRef<google.maps.Polygon | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps()
      .then((g) => {
        if (cancelled || !mapDivRef.current) return;

        const map = new g.maps.Map(mapDivRef.current, {
          center: center ?? DEFAULT_CENTER,
          zoom: center ? 15 : 12,
          streetViewControl: false,
          mapTypeControl: false,
        });

        const polygon = new g.maps.Polygon({
          paths: value ?? [],
          editable: true,
          draggable: true,
          strokeColor: "#c92a2a",
          fillColor: "#c92a2a",
          fillOpacity: 0.15,
          map,
        });
        polygonRef.current = polygon;

        function emit() {
          const path = polygon.getPath();
          const points: LatLng[] = [];
          path.forEach((p) => points.push({ lat: p.lat(), lng: p.lng() }));
          onChangeRef.current(points.length >= 3 ? points : null);
        }
        const path = polygon.getPath();
        g.maps.event.addListener(path, "insert_at", emit);
        g.maps.event.addListener(path, "set_at", emit);
        g.maps.event.addListener(path, "remove_at", emit);

        map.addListener("click", (e: google.maps.MapMouseEvent) => {
          if (!e.latLng) return;
          polygon.getPath().push(e.latLng);
        });

        setReady(true);
      })
      .catch((err) => setError((err as Error).message));

    return () => {
      cancelled = true;
      polygonRef.current?.setMap(null);
    };
    // Solo se inicializa una vez; `value` inicial ya quedó cargado arriba,
    // los cambios posteriores del polígono salen por onChange, no entran.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function clearPolygon() {
    polygonRef.current?.setPath([]);
    onChangeRef.current(null);
  }

  if (error) {
    return (
      <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
        {error}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        ref={mapDivRef}
        className="h-80 w-full rounded-lg border border-neutral-300 bg-neutral-100"
      />
      <div className="flex items-center justify-between gap-3 text-xs text-neutral-500">
        <span>
          {ready
            ? "Hacé clic en el mapa para marcar cada esquina de la zona (mínimo 3). Arrastrá un punto para ajustarlo."
            : "Cargando mapa..."}
        </span>
        {value && value.length > 0 && (
          <button
            type="button"
            onClick={clearPolygon}
            className="shrink-0 font-medium text-red-600 hover:underline"
          >
            Borrar zona
          </button>
        )}
      </div>
    </div>
  );
}
