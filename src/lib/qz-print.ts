// Puente con QZ Tray (app local que expone un WebSocket en wss://localhost:8181
// y habla con la impresora). Solo corre en el navegador de la PC del local.
//
// La firma de cada request la hace el backend (/api/admin/print/sign) para que
// el modo automático no dispare el cartel "Permitir / Bloquear" de QZ Tray.

/* eslint-disable @typescript-eslint/no-explicit-any */

// Clave de localStorage: la impresora elegida es por-PC, no una preferencia
// global del local.
export const PRINTER_KEY = "blend-print-printer";
export const AUTO_KEY = "blend-print-auto";

let qzPromise: Promise<any> | null = null;
let connecting: Promise<void> | null = null;
// Ref al objeto qz una vez cargado, para chequear el estado de forma síncrona.
let qzRef: any = null;

async function getQz(): Promise<any> {
  if (!qzPromise) {
    qzPromise = import("qz-tray").then((mod: any) => {
      const qz = mod.default ?? mod;

      qz.security.setCertificatePromise((resolve: any, reject: any) => {
        fetch("/api/admin/print/sign", { method: "GET" })
          .then((r) => r.text())
          .then((cert) => resolve(cert || undefined))
          .catch(reject);
      });

      if (typeof qz.security.setSignatureAlgorithm === "function") {
        qz.security.setSignatureAlgorithm("SHA512");
      }

      qz.security.setSignaturePromise((toSign: string) => (
        resolve: any,
        reject: any
      ) => {
        fetch("/api/admin/print/sign", {
          method: "POST",
          headers: { "Content-Type": "text/plain" },
          body: toSign,
        })
          .then((r) => r.text())
          .then((sig) => resolve(sig || undefined))
          .catch(reject);
      });

      qzRef = qz;
      return qz;
    });
  }
  return qzPromise;
}

export async function qzConnect(): Promise<void> {
  const qz = await getQz();
  if (qz.websocket.isActive()) return;
  if (!connecting) {
    connecting = qz.websocket
      .connect({ retries: 1, delay: 1 })
      .finally(() => {
        connecting = null;
      });
  }
  await connecting;
}

export async function qzDisconnect(): Promise<void> {
  const qz = await getQz();
  if (qz.websocket.isActive()) await qz.websocket.disconnect();
}

export function qzIsConnected(): boolean {
  try {
    return qzRef?.websocket?.isActive?.() ?? false;
  } catch {
    return false;
  }
}

export async function qzListPrinters(): Promise<string[]> {
  const qz = await getQz();
  await qzConnect();
  const found = await qz.printers.find();
  return Array.isArray(found) ? found : [found].filter(Boolean);
}

// Imprime uno o más bloques ESC/POS crudos, en orden, en la misma impresora.
export async function qzPrintRaw(
  printer: string,
  chunks: string[]
): Promise<void> {
  const qz = await getQz();
  await qzConnect();
  const cfg = qz.configs.create(printer, { encoding: "ISO-8859-1" });
  const data = chunks
    .filter((c) => c && c.length)
    .map((c) => ({ type: "raw", format: "plain", data: c }));
  await qz.print(cfg, data);
}

export function getStoredPrinter(): string | null {
  try {
    return localStorage.getItem(PRINTER_KEY) || null;
  } catch {
    return null;
  }
}

export function getStoredAuto(): boolean {
  try {
    return localStorage.getItem(AUTO_KEY) === "1";
  } catch {
    return false;
  }
}
