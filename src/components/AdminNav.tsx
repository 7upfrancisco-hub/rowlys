"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// El resto de las secciones se navegan desde el tablero del dashboard.
const LINKS = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/configuracion", label: "Configuración" },
];

export default function AdminNav() {
  const pathname = usePathname();

  return (
    <div className="flex flex-wrap gap-1">
      {LINKS.map((link) => {
        const active =
          link.href === "/admin"
            ? pathname === "/admin"
            : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={
              "rounded-lg px-3 py-2 text-sm font-medium transition " +
              (active
                ? "bg-brand-600 text-white"
                : "text-neutral-600 hover:bg-brand-50 hover:text-brand-700")
            }
          >
            {link.label}
          </Link>
        );
      })}
    </div>
  );
}
