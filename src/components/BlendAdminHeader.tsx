"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import LogoutButton from "@/components/LogoutButton";

const LINKS = [
  { href: "/blend-admin", label: "Dashboard" },
  { href: "/blend-admin/clientes", label: "Clientes" },
];

// Header del panel de super-admin (Fase 26c/27) — deliberadamente distinto
// del AdminHeader de cada tenant (navy en vez de blanco+rojo) para que se
// note a simple vista que estás en "modo Blend", no en el panel de un local.
export default function BlendAdminHeader() {
  const pathname = usePathname();

  return (
    <header className="border-b border-navy-800 bg-navy-900">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-6 py-4">
        <div className="flex items-baseline gap-2">
          <Link
            href="/blend-admin"
            aria-label="Blend — ir al dashboard"
            className="text-xl font-extrabold tracking-tight text-white"
          >
            Blend
          </Link>
          <span className="text-sm text-navy-200">Super-admin</span>
        </div>
        <div className="flex flex-wrap items-center gap-1 text-sm">
          {LINKS.map((link) => {
            const active =
              link.href === "/blend-admin"
                ? pathname === "/blend-admin"
                : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={
                  "rounded-lg px-3 py-2 font-medium transition " +
                  (active
                    ? "bg-white text-navy-900"
                    : "text-navy-100 hover:bg-navy-800")
                }
              >
                {link.label}
              </Link>
            );
          })}
          <LogoutButton
            endpoint="/api/blend-admin/logout"
            redirectTo="/blend-admin/login"
            className="rounded-lg px-3 py-2 font-medium text-navy-100 hover:bg-navy-800 hover:text-white"
          />
        </div>
      </div>
    </header>
  );
}
