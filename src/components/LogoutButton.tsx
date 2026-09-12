"use client";

import { useRouter } from "next/navigation";

// `endpoint`/`redirectTo` por defecto son los del login de tenant
// (/login). El super-admin de Blend (Fase 26c) reusa este mismo botón
// pasando los suyos (/api/blend-admin/logout, /blend-admin/login) — son dos
// sistemas de sesión completamente aparte (ver src/lib/auth.ts).
export default function LogoutButton({
  endpoint = "/api/auth/logout",
  redirectTo = "/login",
}: {
  endpoint?: string;
  redirectTo?: string;
}) {
  const router = useRouter();

  async function handleLogout() {
    await fetch(endpoint, { method: "POST" });
    router.push(redirectTo);
    router.refresh();
  }

  return (
    <button
      onClick={handleLogout}
      className="text-sm font-medium text-neutral-500 hover:text-brand-600 hover:underline"
    >
      Cerrar sesión
    </button>
  );
}
