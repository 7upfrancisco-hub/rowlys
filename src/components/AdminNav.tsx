"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

// El resto de las secciones se navegan desde el tablero del dashboard.
const CONFIG_LINKS = [
  {
    href: "/admin/repartidores",
    label: "Repartidores",
    desc: "Perfiles para asignar a los envíos",
  },
  {
    href: "/admin/configuracion",
    label: "Datos del local",
    desc: "Envío, alias bancario, horarios",
  },
  {
    href: "/admin/zonas-envio",
    label: "Zonas de envío",
    desc: "Tarifas y áreas de cobertura por zona",
  },
  {
    href: "/admin/personalizacion",
    label: "Personalización",
    desc: "Color de marca y tipografía de la carta",
  },
];

export default function AdminNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const dashboardActive = pathname === "/admin";
  const configActive = CONFIG_LINKS.some((link) =>
    pathname.startsWith(link.href)
  );

  return (
    <div className="flex flex-wrap gap-1">
      <Link
        href="/admin"
        className={
          "rounded-lg px-3 py-2 text-sm font-medium transition " +
          (dashboardActive
            ? "bg-brand-600 text-white"
            : "text-neutral-600 hover:bg-brand-50 hover:text-brand-700")
        }
      >
        Dashboard
      </Link>
      <div className="relative" ref={ref}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className={
            "rounded-lg px-3 py-2 text-sm font-medium transition " +
            (configActive
              ? "bg-brand-600 text-white"
              : "text-neutral-600 hover:bg-brand-50 hover:text-brand-700")
          }
        >
          Configuración
        </button>
        {open && (
          <div className="absolute right-0 top-full z-10 mt-1 w-64 rounded-xl border border-neutral-200 bg-white p-1 shadow-lg">
            {CONFIG_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="block rounded-lg px-3 py-2 transition hover:bg-brand-50"
              >
                <span className="block text-sm font-medium text-neutral-800">
                  {link.label}
                </span>
                <span className="block text-xs text-neutral-400">
                  {link.desc}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
