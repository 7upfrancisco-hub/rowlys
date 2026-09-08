// Generador de tickets ESC/POS para comanderas térmicas de 80mm. Puro (sin
// dependencias de Node ni del navegador): se usa en el cliente, en `/comanda` y
// en `/admin/pedidos`, para armar el texto que después se manda a QZ Tray.
//
// Dos tickets por pedido:
//  - buildComandaTicket: para la cocina/el local. Todo el pedido.
//  - buildClienteTicket: para el cliente. Nombre del local, lo que compró y un
//    "¡Gracias por su compra!".
// En ambos, el nombre del local va grande arriba y "Blend" queda como pie.

import {
  PAYMENT_PROVIDER_LABELS,
  PAYMENT_STATUS_LABELS,
  formatCurrency,
  type OrderDTO,
} from "@/types";

// Nombre de la plataforma (marca). El del local sale de Settings.
export const BRAND = "Blend";

// Columnas de una térmica de 80mm en Font A.
const WIDTH = 48;
const AR_TZ = "America/Argentina/Buenos_Aires";

const ESC = "\x1B";
const GS = "\x1D";

const CMD = {
  init: ESC + "@",
  boldOn: ESC + "E\x01",
  boldOff: ESC + "E\x00",
  left: ESC + "a\x00",
  center: ESC + "a\x01",
  // Doble ancho + doble alto / solo doble alto / normal.
  big: GS + "!\x11",
  tall: GS + "!\x01",
  normal: GS + "!\x00",
  // Avanza 4 líneas y corta el papel.
  cut: GS + "VB\x04",
};

export interface StoreInfo {
  name: string;
  address?: string | null;
  phone?: string | null;
}

// Saca acentos y símbolos que las térmicas genéricas no mapean bien. Solo se
// aplica al texto, nunca a los bytes de control ESC/POS.
export function fold(s: string): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // marcas de acento combinantes
    .replace(/[¡¿]/g, "") // ¡ ¿
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/[^\x09\x0a\x0d\x20-\x7e]/g, "");
}

function fmtDateTime(iso: string): string {
  const dt = new Date(iso);
  return (
    dt.toLocaleDateString("es-AR", { timeZone: AR_TZ }) +
    " " +
    dt.toLocaleTimeString("es-AR", {
      timeZone: AR_TZ,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
  );
}

function money(n: number): string {
  return formatCurrency(Math.round(n));
}

// Total de una línea del pedido: (precio unitario + adicionales) × cantidad.
function lineTotal(item: OrderDTO["items"][number]): number {
  const opts = item.options.reduce((s, o) => s + o.price, 0);
  return (item.price + opts) * item.quantity;
}

function textLine(text = ""): string {
  return fold(text) + "\n";
}

function rule(ch = "-"): string {
  return ch.repeat(WIDTH) + "\n";
}

// "izquierda ......... derecha" en una línea; si no entra, la derecha baja.
function cols(left: string, right: string): string {
  const l = fold(left);
  const r = fold(right);
  const gap = WIDTH - l.length - r.length;
  if (gap >= 1) return l + " ".repeat(gap) + r + "\n";
  return l + "\n" + " ".repeat(Math.max(0, WIDTH - r.length)) + r + "\n";
}

function header(store: StoreInfo, lines: string[]): string {
  let out = CMD.center + CMD.big + fold(store.name) + CMD.normal + "\n";
  for (const l of lines) out += CMD.center + fold(l) + "\n";
  return out + CMD.left;
}

function footer(): string {
  return CMD.center + fold(`gestionado con ${BRAND}`) + "\n" + CMD.left + CMD.cut;
}

function paymentLine(order: OrderDTO): string {
  if (!order.payment) return "Sin pago";
  return `${PAYMENT_PROVIDER_LABELS[order.payment.provider]} - ${
    PAYMENT_STATUS_LABELS[order.payment.status]
  }`;
}

// --- Ticket de cocina / local -------------------------------------------------

export function buildComandaTicket(order: OrderDTO, store: StoreInfo): string {
  let t = CMD.init;
  t += header(store, []);
  t += CMD.center + "COMANDA\n";
  t += CMD.center + CMD.tall + "#" + order.number + CMD.normal + "\n";
  t += CMD.center + fold(fmtDateTime(order.createdAt)) + "\n";
  t += CMD.left + rule();

  t +=
    textLine(
      order.orderType === "DELIVERY"
        ? "ENVIO A DOMICILIO"
        : "RETIRO EN EL LOCAL"
    ) +
    textLine(`${order.customerFirstName} ${order.customerLastName}`.trim()) +
    textLine(order.customerPhone);
  if (order.deliveryAddress) t += textLine(order.deliveryAddress);
  t += rule();

  for (const it of order.items) {
    t += CMD.boldOn + fold(`${it.quantity}x  ${it.productName}`) + CMD.boldOff + "\n";
    if (it.options.length) {
      t += textLine("    " + it.options.map((o) => o.name).join(", "));
    }
    if (it.notes) t += textLine("    Nota: " + it.notes);
  }
  t += rule();

  if (order.notes) {
    t += textLine("NOTA DEL PEDIDO:") + textLine(order.notes) + rule();
  }

  t += CMD.boldOn + cols("TOTAL", money(order.total)) + CMD.boldOff;
  t += textLine(paymentLine(order));
  if (
    order.payment?.provider === "CASH" &&
    order.payment.changeFor != null
  ) {
    t += textLine(
      `Paga con ${money(order.payment.changeFor)} - vuelto ${money(
        Math.max(0, order.payment.changeFor - order.total)
      )}`
    );
  }
  t += rule();
  t += footer();
  return t;
}

// --- Ticket del cliente -----------------------------------------------------

export function buildClienteTicket(order: OrderDTO, store: StoreInfo): string {
  const subtotal = order.total - order.deliveryFee;
  let t = CMD.init;

  const sub: string[] = [];
  if (store.address) sub.push(store.address);
  if (store.phone) sub.push(store.phone);
  t += header(store, sub);
  t += rule();

  t += cols(`Pedido #${order.number}`, fmtDateTime(order.createdAt));
  t += rule();

  for (const it of order.items) {
    t += cols(`${it.quantity}x ${it.productName}`, money(lineTotal(it)));
    if (it.options.length) {
      t += textLine("    " + it.options.map((o) => o.name).join(", "));
    }
  }
  t += rule();

  t += cols("Subtotal", money(subtotal));
  if (order.deliveryFee > 0) t += cols("Envio", money(order.deliveryFee));
  t += CMD.boldOn + cols("TOTAL", money(order.total)) + CMD.boldOff;
  t += rule();

  t += CMD.center + CMD.tall + "Gracias por su compra!" + CMD.normal + "\n";
  t += CMD.center + fold(store.name) + "\n" + CMD.left;
  t += "\n";
  t += footer();
  return t;
}

// Ticket corto para el botón "Imprimir prueba".
export function buildTestTicket(store: StoreInfo): string {
  let t = CMD.init;
  t += header(store, []);
  t += CMD.center + "PRUEBA DE IMPRESION\n";
  t += CMD.center + fold(fmtDateTime(new Date().toISOString())) + "\n";
  t += CMD.left + rule();
  t += textLine("Si estas leyendo esto, la comandera");
  t += textLine("quedo conectada a Blend.");
  t += rule();
  t += footer();
  return t;
}
