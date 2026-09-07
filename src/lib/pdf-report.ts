import { jsPDF } from "jspdf";
// Import por efecto: parchea jsPDF.prototype.autoTable (funciona en todos los
// bundlers; la forma funcional `autoTable(doc, ...)` rompe bajo ESM nativo).
import "jspdf-autotable";

type AutoTableDoc = jsPDF & {
  autoTable: (options: Record<string, unknown>) => void;
  lastAutoTable?: { finalY: number };
};

// Genera y descarga un PDF tabular prolijo (para exportar pedidos / métricas).
// Solo corre en el navegador.

type Cell = string | number | null | undefined;

export interface PdfReportOptions {
  filename: string;
  title: string;
  subtitle?: string;
  // Línea de totales arriba de la tabla (ej. ["17 pedidos", "Facturado $ 12.000"]).
  summary?: string[];
  columns: string[];
  rows: Cell[][];
  // Índices de columnas numéricas: se alinean a la derecha.
  numericCols?: number[];
  // Índice de una columna "ancha" (ej. Ítems): se le da más espacio.
  wideCol?: number;
}

const NAVY: [number, number, number] = [30, 41, 59];
const MUTED: [number, number, number] = [113, 113, 122];
const LINE: [number, number, number] = [228, 225, 220];

export function downloadPdfReport(opts: PdfReportOptions): void {
  if (typeof window === "undefined") return;

  const doc = new jsPDF({
    orientation: "landscape",
    unit: "pt",
    format: "a4",
  }) as AutoTableDoc;
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const M = 40;

  const generated = new Date().toLocaleString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const hasSummary = !!opts.summary && opts.summary.length > 0;
  const tableTop = hasSummary ? 92 : 74;

  const drawHeader = () => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
    doc.text(opts.title, M, 34);
    if (opts.subtitle) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
      doc.text(opts.subtitle, M, 48);
    }
    if (hasSummary) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
      doc.text(opts.summary!.join("        "), M, 66);
    }
    doc.setDrawColor(LINE[0], LINE[1], LINE[2]);
    doc.setLineWidth(0.8);
    doc.line(M, tableTop - 8, pageW - M, tableTop - 8);
  };

  const drawFooter = (pageNumber: number) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);
    doc.text(`Generado ${generated} · Blend`, M, pageH - 20);
    doc.text(`Pagina ${pageNumber}`, pageW - M, pageH - 20, { align: "right" });
  };

  const columnStyles: Record<number, Record<string, unknown>> = {};
  for (const c of opts.numericCols ?? []) columnStyles[c] = { halign: "right" };
  if (opts.wideCol != null) {
    columnStyles[opts.wideCol] = {
      ...(columnStyles[opts.wideCol] ?? {}),
      cellWidth: 200,
    };
  }

  doc.autoTable({
    head: [opts.columns],
    body: opts.rows.map((r) => r.map((c) => (c == null ? "" : String(c)))),
    startY: tableTop,
    margin: { top: tableTop, left: M, right: M, bottom: 34 },
    styles: {
      fontSize: 7.5,
      cellPadding: 3.5,
      overflow: "linebreak",
      lineColor: LINE,
      lineWidth: 0.5,
      textColor: [40, 40, 40],
    },
    headStyles: {
      fillColor: NAVY,
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 7.5,
    },
    alternateRowStyles: { fillColor: [248, 248, 247] },
    columnStyles,
    didDrawPage: (data: { pageNumber: number }) => {
      drawHeader();
      drawFooter(data.pageNumber);
    },
  });

  if (opts.rows.length === 0) {
    const finalY = doc.lastAutoTable?.finalY ?? tableTop;
    doc.setFont("helvetica", "italic");
    doc.setFontSize(9);
    doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
    doc.text("Sin datos para este periodo.", M, finalY + 18);
  }

  doc.save(opts.filename);
}
