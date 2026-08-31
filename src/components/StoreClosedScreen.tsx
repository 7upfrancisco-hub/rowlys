"use client";

// Pantalla que ve el cliente cuando el local está marcado como cerrado
// (Settings.storeOpen = false). Se muestra antes del menú; el botón deja
// entrar igual (el bypass lo maneja quien la renderiza, por sesión).

export default function StoreClosedScreen({
  storeName,
  title,
  message,
  onContinue,
}: {
  storeName: string;
  title: string;
  message: string;
  onContinue: () => void;
}) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 px-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full border border-line text-accent">
        <svg
          viewBox="0 0 24 24"
          className="h-7 w-7"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
      </div>

      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted">
          {storeName}
        </p>
        <h1 className="mt-1 text-2xl font-bold text-accent">{title}</h1>
      </div>

      {message && (
        <p className="whitespace-pre-line text-sm text-muted">{message}</p>
      )}

      <button
        type="button"
        onClick={onContinue}
        className="rounded-lg border border-line bg-surface px-5 py-3 text-sm font-medium text-fg transition hover:bg-surface-2"
      >
        Ver el menú igual
      </button>
    </main>
  );
}
