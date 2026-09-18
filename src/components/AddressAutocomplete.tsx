"use client";

import { useEffect, useRef } from "react";
import { loadGoogleMaps } from "@/lib/google-maps";

export interface AddressSelection {
  address: string;
  lat: number;
  lng: number;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSelect: (value: AddressSelection) => void;
  placeholder?: string;
  className?: string;
  required?: boolean;
}

// Input de dirección con autocompletar de Google (si hay API key
// configurada). Sin key, o mientras carga, sigue funcionando como texto
// libre de siempre — nunca bloquea escribir la dirección a mano.
export default function AddressAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder,
  className,
  required,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const onChangeRef = useRef(onChange);
  const onSelectRef = useRef(onSelect);
  onChangeRef.current = onChange;
  onSelectRef.current = onSelect;

  useEffect(() => {
    let cancelled = false;
    let autocomplete: google.maps.places.Autocomplete | null = null;

    loadGoogleMaps()
      .then((g) => {
        if (cancelled || !inputRef.current) return;
        autocomplete = new g.maps.places.Autocomplete(inputRef.current, {
          fields: ["formatted_address", "geometry"],
          componentRestrictions: { country: "ar" },
        });
        autocomplete.addListener("place_changed", () => {
          const place = autocomplete!.getPlace();
          const loc = place.geometry?.location;
          if (!loc) return;
          const formatted = place.formatted_address ?? inputRef.current!.value;
          onChangeRef.current(formatted);
          onSelectRef.current({ address: formatted, lat: loc.lat(), lng: loc.lng() });
        });
      })
      .catch(() => {
        // Sin API key configurada: el campo sigue siendo texto libre.
      });

    return () => {
      cancelled = true;
      if (autocomplete) {
        google.maps.event.clearInstanceListeners(autocomplete);
      }
    };
  }, []);

  return (
    <input
      ref={inputRef}
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={className}
      required={required}
      autoComplete="off"
    />
  );
}
