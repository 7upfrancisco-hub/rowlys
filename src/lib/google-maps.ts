declare global {
  interface Window {
    google?: typeof google;
    __blendInitGoogleMaps?: () => void;
  }
}

let loadPromise: Promise<typeof google> | null = null;

// Inyecta el script de Google Maps (Maps JS + Places) una sola vez por
// pestaña y devuelve el mismo objeto `google` a quien lo pida después,
// aunque se llame desde varios componentes (mapa de admin, autocompletar del
// checkout). Sin NEXT_PUBLIC_GOOGLE_MAPS_API_KEY configurada, rechaza con un
// mensaje claro en vez de romper silenciosamente.
export function loadGoogleMaps(): Promise<typeof google> {
  if (typeof window === "undefined") {
    return Promise.reject(
      new Error("Google Maps solo se puede cargar en el navegador.")
    );
  }
  if (window.google?.maps) {
    return Promise.resolve(window.google);
  }
  if (loadPromise) return loadPromise;

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return Promise.reject(
      new Error(
        "Falta configurar el mapa (NEXT_PUBLIC_GOOGLE_MAPS_API_KEY)."
      )
    );
  }

  loadPromise = new Promise((resolve, reject) => {
    window.__blendInitGoogleMaps = () => {
      if (window.google) resolve(window.google);
      else reject(new Error("No se pudo cargar Google Maps."));
    };
    const script = document.createElement("script");
    script.src =
      `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}` +
      `&libraries=places&loading=async&callback=__blendInitGoogleMaps`;
    script.async = true;
    script.onerror = () => reject(new Error("No se pudo cargar Google Maps."));
    document.head.appendChild(script);
  });

  return loadPromise;
}
