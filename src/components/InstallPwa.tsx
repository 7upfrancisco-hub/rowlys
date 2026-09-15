"use client";

import { useEffect, useState } from "react";

const DISMISSED_KEY = "blend-pwa-install-dismissed";

// Se registra en cualquier página del storefront (no en checkout/pedido, para
// no meterse en medio del pago). Cubre los dos caminos reales de instalar una
// PWA: Chrome/Edge/Android disparan `beforeinstallprompt` y se puede pedir el
// diálogo nativo directo; iOS Safari no tiene ese evento, así que ahí solo se
// puede mostrar el instructivo manual (Compartir → Agregar a inicio).
export default function InstallPwa() {
  const [deferredPrompt, setDeferredPrompt] = useState<Event | null>(null);
  const [installed, setInstalled] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [dismissed, setDismissed] = useState(true);
  const [showIosHelp, setShowIosHelp] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }

    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as { standalone?: boolean }).standalone === true;
    setInstalled(standalone);
    setIsIos(/iphone|ipad|ipod/i.test(window.navigator.userAgent));
    try {
      setDismissed(localStorage.getItem(DISMISSED_KEY) === "1");
    } catch {
      setDismissed(false);
    }

    function onBeforeInstallPrompt(e: Event) {
      e.preventDefault();
      setDeferredPrompt(e);
    }
    function onInstalled() {
      setInstalled(true);
      setDeferredPrompt(null);
    }
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  function dismiss() {
    setDismissed(true);
    setShowIosHelp(false);
    try {
      localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      /* modo incógnito / storage bloqueado: reaparece la próxima visita, no rompe */
    }
  }

  async function handleInstallClick() {
    if (!deferredPrompt) return;
    // TS no tipa bien BeforeInstallPromptEvent (no es un evento DOM estándar).
    await (deferredPrompt as unknown as { prompt: () => Promise<void> }).prompt();
    setDeferredPrompt(null);
  }

  if (installed || dismissed) return null;
  if (!deferredPrompt && !isIos) return null;

  // Arriba (no abajo): /menu tiene un botón fijo de carrito pegado al piso
  // cuando hay ítems agregados, y no queremos taparlo.
  return (
    <div className="fixed inset-x-4 top-16 z-20 mx-auto flex max-w-sm flex-col gap-2 rounded-2xl border border-line bg-surface p-4 shadow-lg">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-fg">Instalá la app</p>
          <p className="mt-0.5 text-xs text-muted">
            Accedé directo desde tu celular, sin buscar en el navegador.
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Cerrar"
          className="shrink-0 text-muted hover:text-fg"
        >
          ✕
        </button>
      </div>

      {deferredPrompt ? (
        <button
          type="button"
          onClick={handleInstallClick}
          className="rounded-lg bg-accent-solid px-3 py-2 text-sm font-semibold text-on-accent hover:bg-accent-solid-hover"
        >
          Instalar
        </button>
      ) : showIosHelp ? (
        <p className="rounded-lg bg-surface-2 p-3 text-xs text-fg">
          Tocá el ícono Compartir <span aria-hidden>⬆️</span> de Safari y elegí
          &quot;Agregar a pantalla de inicio&quot;.
        </p>
      ) : (
        <button
          type="button"
          onClick={() => setShowIosHelp(true)}
          className="rounded-lg border border-line px-3 py-2 text-sm font-medium text-fg hover:bg-surface-2"
        >
          ¿Cómo la instalo?
        </button>
      )}
    </div>
  );
}
