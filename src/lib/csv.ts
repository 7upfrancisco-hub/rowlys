// Utilidades para exportar datos a CSV (historial de pedidos, métricas del mes).

type Cell = string | number | null | undefined;

function escapeField(value: Cell): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  // Comillas dobles y separador/saltos de línea obligan a envolver el campo.
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

// BOM UTF-8: hace que Excel abra el CSV con los acentos/ñ bien.
const BOM = String.fromCharCode(0xfeff);

export function toCsv(headers: string[], rows: Cell[][]): string {
  const lines = [headers, ...rows].map((row) => row.map(escapeField).join(","));
  return BOM + lines.join("\r\n") + "\r\n";
}

// Dispara la descarga de un CSV en el navegador. No hace nada fuera del browser.
export function downloadCsv(filename: string, csv: string): void {
  if (typeof window === "undefined") return;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
