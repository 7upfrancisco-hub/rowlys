"use client";

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import type * as LeafletNS from "leaflet";
import type { LatLng } from "@/lib/geo";

interface Props {
  value: LatLng[] | null;
  onChange: (polygon: LatLng[] | null) => void;
  // Centro inicial del mapa (ej. dirección del local ya geocodificada). Sin
  // esto, arranca centrado en Buenos Aires como referencia genérica.
  center?: LatLng;
}

const DEFAULT_CENTER: LatLng = { lat: -34.6037, lng: -58.3816 };

function vertexIcon(L: typeof LeafletNS) {
  return L.divIcon({
    className: "",
    html:
      '<div style="width:14px;height:14px;border-radius:9999px;background:#c92a2a;' +
      'border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,.4)"></div>',
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

interface MapState {
  map: LeafletNS.Map;
  polygon: LeafletNS.Polygon;
  markers: LeafletNS.Marker[];
  points: LeafletNS.LatLng[];
}

// Editor de polígono sobre OpenStreetMap (Leaflet, sin API key): clic en el
// mapa para agregar una esquina al final, arrastrar un punto existente para
// moverlo, clic en un punto para borrarlo. `value`/`onChange` son la única
// fuente de verdad — el dibujo en el mapa solo la refleja.
export default function DeliveryZoneMap({ value, onChange, center }: Props) {
  const mapDivRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<MapState | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    import("leaflet").then((L) => {
      if (cancelled || !mapDivRef.current) return;

      const map = L.map(mapDivRef.current).setView(
        [center?.lat ?? DEFAULT_CENTER.lat, center?.lng ?? DEFAULT_CENTER.lng],
        center ? 15 : 12
      );
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);

      const polygon = L.polygon([], {
        color: "#c92a2a",
        fillOpacity: 0.15,
      }).addTo(map);

      const state: MapState = {
        map,
        polygon,
        markers: [],
        points: (value ?? []).map((p) => L.latLng(p.lat, p.lng)),
      };
      stateRef.current = state;

      function emit() {
        const pts = state.points.map((p) => ({ lat: p.lat, lng: p.lng }));
        onChangeRef.current(pts.length >= 3 ? pts : null);
      }

      function redraw() {
        polygon.setLatLngs(state.points);
        state.markers.forEach((m) => m.remove());
        state.markers = state.points.map((pt, idx) => {
          const marker = L.marker(pt, {
            draggable: true,
            icon: vertexIcon(L),
          }).addTo(map);
          marker.on("drag", () => {
            state.points[idx] = marker.getLatLng();
            polygon.setLatLngs(state.points);
          });
          marker.on("dragend", emit);
          marker.on("click", () => {
            state.points.splice(idx, 1);
            redraw();
            emit();
          });
          return marker;
        });
      }

      map.on("click", (e: LeafletNS.LeafletMouseEvent) => {
        state.points.push(e.latlng);
        redraw();
        emit();
      });

      redraw();
      setReady(true);
    });

    return () => {
      cancelled = true;
      stateRef.current?.map.remove();
      stateRef.current = null;
    };
    // Solo se inicializa una vez; `value` inicial ya quedó cargado arriba,
    // los cambios posteriores del polígono salen por onChange, no entran.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function clearPolygon() {
    const state = stateRef.current;
    if (state) {
      state.points = [];
      state.markers.forEach((m) => m.remove());
      state.markers = [];
      state.polygon.setLatLngs([]);
    }
    onChangeRef.current(null);
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
            ? "Hacé clic en el mapa para marcar cada esquina de la zona (mínimo 3). Arrastrá un punto para moverlo, o hacé clic en un punto para borrarlo."
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
