export interface LatLng {
  lat: number;
  lng: number;
}

// Ray casting: cuenta cuántas veces un rayo horizontal desde el punto cruza
// los lados del polígono. Impar = adentro, par = afuera. Suficiente para los
// polígonos simples (no auto-intersectados) que se dibujan en el admin.
export function pointInPolygon(point: LatLng, polygon: LatLng[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lng;
    const yi = polygon[i].lat;
    const xj = polygon[j].lng;
    const yj = polygon[j].lat;

    const intersects =
      yi > point.lat !== yj > point.lat &&
      point.lng < ((xj - xi) * (point.lat - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}
