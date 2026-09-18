"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api-client";

export interface AddressSelection {
  address: string;
  lat: number;
  lng: number;
}

interface Suggestion {
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

// Input de dirección con sugerencias de OpenStreetMap (gratis, sin API key).
// Busca con un debounce corto mientras el cliente tipea; si no elige ninguna
// sugerencia, el texto queda como dirección libre de siempre (sin
// coordenadas) — nunca bloquea escribir a mano.
export default function AddressAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder,
  className,
  required,
}: Props) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Evita mostrar sugerencias de vuelta apenas el cliente elige una (el
  // onChange que dispara el input al setear `value` no debería reabrir la
  // búsqueda con el mismo texto).
  const skipNextSearch = useRef(false);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  useEffect(() => {
    if (skipNextSearch.current) {
      skipNextSearch.current = false;
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.trim().length < 3) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    debounceRef.current = setTimeout(() => {
      setLoading(true);
      apiFetch<Suggestion[]>(`/api/geocode?q=${encodeURIComponent(value.trim())}`)
        .then((results) => {
          setSuggestions(results);
          setOpen(results.length > 0);
        })
        .catch(() => setSuggestions([]))
        .finally(() => setLoading(false));
    }, 450);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function handleSelect(s: Suggestion) {
    skipNextSearch.current = true;
    setOpen(false);
    setSuggestions([]);
    onChange(s.address);
    onSelect(s);
  }

  return (
    <div ref={wrapperRef} className="relative">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        placeholder={placeholder}
        className={className}
        required={required}
        autoComplete="off"
      />
      {open && (
        <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-line bg-surface shadow-lg">
          {suggestions.map((s, i) => (
            <li key={i}>
              <button
                type="button"
                onClick={() => handleSelect(s)}
                className="block w-full px-3 py-2 text-left text-sm text-fg hover:bg-surface-2"
              >
                {s.address}
              </button>
            </li>
          ))}
        </ul>
      )}
      {loading && (
        <p className="mt-1 text-xs text-muted">Buscando dirección...</p>
      )}
    </div>
  );
}
