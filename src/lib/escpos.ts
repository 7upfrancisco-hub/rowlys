// Generador de tickets ESC/POS para comanderas térmicas de 80mm. Puro (sin
// dependencias de Node ni del navegador): se usa en el cliente, en `/comanda` y
// en `/admin/pedidos`, para armar el texto que después se manda a QZ Tray.
//
// Dos tickets por pedido:
//  - buildComandaTicket: para la cocina. "blend" arriba; número de pedido
//    gigante (~1.5 cm) al final; ítems a x3; el resto de los datos a x2.
//  - buildClienteTicket: para el cliente. Jerarquía: nombre del local arriba y
//    TOTAL grande. El detalle, tamaño normal.
// En ambos, "Blend" queda como pie discreto.

import { formatCurrency, type OrderDTO } from "@/types";

// Nombre de la plataforma (marca). El del local sale de Settings.
export const BRAND = "Blend";

// Columnas de una térmica de 80mm en Font A.
const WIDTH = 48;
const AR_TZ = "America/Argentina/Buenos_Aires";

const ESC = "\x1B";
const GS = "\x1D";

// GS ! n : nibble alto = ancho (x1..x8), nibble bajo = alto (x1..x8).
const CMD = {
  init: ESC + "@",
  boldOn: ESC + "E\x01",
  boldOff: ESC + "E\x00",
  left: ESC + "a\x00",
  center: ESC + "a\x01",
  sizeNormal: GS + "!\x00",
  sizeTall: GS + "!\x01", // alto x2 (no cambia el ancho: sirve para columnas)
  sizeWide: GS + "!\x10", // ancho x2
  sizeBig: GS + "!\x11", // ancho x2 + alto x2
  sizeXl: GS + "!\x22", // ancho x3 + alto x3
  sizeHuge: GS + "!\x44", // ancho x5 + alto x5 (~1.5 cm de alto)
  // Avanza 4 líneas y corta el papel.
  cut: GS + "VB\x04",
};

export interface StoreInfo {
  name: string;
  address?: string | null;
  phone?: string | null;
  // Minutos de preparación por canal (de Settings). Si vienen, la comanda
  // muestra "Entrega estimada: HH:MM".
  prepMinutes?: { pickup: number; delivery: number };
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

function fmtClock(ms: number): string {
  return new Date(ms).toLocaleTimeString("es-AR", {
    timeZone: AR_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

// Hora estimada de entrega = alta + demora del canal + demora extra del pedido.
// Misma cuenta que el seguimiento del cliente (/pedido/[id]).
function etaFor(order: OrderDTO, store: StoreInfo): string | null {
  const p = store.prepMinutes;
  if (!p) return null;
  const base = order.orderType === "DELIVERY" ? p.delivery : p.pickup;
  const mins = base + (order.extraDelayMinutes ?? 0);
  return fmtClock(new Date(order.createdAt).getTime() + mins * 60000);
}

// Total de una línea del pedido: (precio unitario + adicionales) × cantidad.
function lineTotal(item: OrderDTO["items"][number]): number {
  const opts = item.options.reduce((s, o) => s + o.price, 0);
  return (item.price + opts) * item.quantity;
}

type Size = "normal" | "tall" | "wide" | "big" | "xl" | "huge";

function sizeCmd(size?: Size): string {
  switch (size) {
    case "huge":
      return CMD.sizeHuge;
    case "xl":
      return CMD.sizeXl;
    case "big":
      return CMD.sizeBig;
    case "wide":
      return CMD.sizeWide;
    case "tall":
      return CMD.sizeTall;
    default:
      return "";
  }
}

interface LineOpts {
  size?: Size;
  bold?: boolean;
  center?: boolean;
}

// Una línea con estilo. Fija la alineación al principio (la alineación ESC/POS
// es por-línea: hay que setearla antes del salto, no resetearla después). El
// tamaño y la negrita sí se resetean al final (son por-carácter).
function line(text = "", opts: LineOpts = {}): string {
  const sz = sizeCmd(opts.size);
  let s = opts.center ? CMD.center : CMD.left;
  if (opts.bold) s += CMD.boldOn;
  s += sz + fold(text);
  if (sz) s += CMD.sizeNormal;
  if (opts.bold) s += CMD.boldOff;
  return s + "\n";
}

function rule(ch = "-"): string {
  return CMD.left + ch.repeat(WIDTH) + "\n";
}

// "izquierda ......... derecha" en una línea alineada a la izquierda; si no
// entra, la derecha baja a su propia línea. `size` acepta solo estilos que NO
// cambian el ancho de carácter (tall) para que las columnas sigan cuadrando.
function cols(
  left: string,
  right: string,
  opts: { size?: "normal" | "tall"; bold?: boolean } = {}
): string {
  const l = fold(left);
  const r = fold(right);
  const gap = WIDTH - l.length - r.length;
  const body =
    gap >= 1
      ? l + " ".repeat(gap) + r
      : l + "\n" + " ".repeat(Math.max(0, WIDTH - r.length)) + r;
  const sz = sizeCmd(opts.size);
  return (
    CMD.left +
    (opts.bold ? CMD.boldOn : "") +
    sz +
    body +
    (sz ? CMD.sizeNormal : "") +
    (opts.bold ? CMD.boldOff : "") +
    "\n"
  );
}

function footer(): string {
  return line(`gestionado con ${BRAND}`, { center: true }) + CMD.cut;
}

// --- Ticket de cocina / local (estilo RestoSimple) -------------------------
//
// Sin plata: solo "TOTAL PRODUCTOS" + cantidad. El número de pedido va gigante
// al final. El total en $ vive en el ticket del cliente. Escala (referencia:
// el número de pedido mide ~1.5 cm): ítems a x3, el resto de los datos a x2.

export function buildComandaTicket(order: OrderDTO, store: StoreInfo): string {
  const isDelivery = order.orderType === "DELIVERY";
  const units = order.items.reduce((s, it) => s + it.quantity, 0);
  const eta = etaFor(order, store);
  let t = CMD.init;

  // Marca arriba; nombre del local y fecha, chicos, debajo.
  t += line("blend", { center: true, size: "xl", bold: true });
  t += line(store.name, { center: true });
  t += line(fmtDateTime(order.createdAt), { center: true });
  t += rule("=");

  // Ítems: centrados, x3, sin precio. Opciones y nota del ítem a x2.
  for (const it of order.items) {
    t += line(`${it.quantity}x ${it.productName}`, {
      center: true,
      size: "xl",
      bold: true,
    });
    if (it.options.length) {
      t += line(it.options.map((o) => o.name).join(", "), {
        center: true,
        size: "big",
      });
    }
    if (it.notes) t += line("Nota: " + it.notes, { center: true, size: "big" });
  }
  t += rule();

  t += line(`TOTAL PRODUCTOS   ${units}`, {
    center: true,
    size: "big",
    bold: true,
  });
  t += rule();

  // Canal + cliente + entrega, todo a x2.
  t += line(isDelivery ? "ENVIO" : "RETIRO", { size: "big", bold: true });
  t += line(`${order.customerFirstName} ${order.customerLastName}`.trim(), {
    size: "big",
  });
  if (order.deliveryAddress) t += line(order.deliveryAddress, { size: "big" });
  if (order.customerPhone) t += line(order.customerPhone, { size: "big" });
  if (eta) t += line(`Entrega estimada: ${eta}`, { size: "big", bold: true });

  if (order.notes) {
    t += rule();
    t += line("NOTA: " + order.notes, { size: "big", bold: true });
  }
  t += rule();

  // Número gigante al final (~1.5 cm de alto, como el "T25" de RestoSimple).
  t += line("");
  t += line("#" + order.number, { center: true, size: "huge" });
  t += line("");
  t += footer();
  return t;
}

// --- Ticket del cliente ---------------------------------------------------

export function buildClienteTicket(order: OrderDTO, store: StoreInfo): string {
  const subtotal = order.total - order.deliveryFee;
  let t = CMD.init;

  // Marca del local arriba, bien grande.
  t += line(store.name, { center: true, size: "xl" });
  if (store.address) t += line(store.address, { center: true });
  if (store.phone) t += line(store.phone, { center: true });
  t += rule();

  t += line(`Pedido #${order.number}`, { size: "big", bold: true });
  t += line(fmtDateTime(order.createdAt), { size: "tall" });
  t += rule();

  // Detalle: doble alto (mantiene el ancho para que la columna de precios
  // quede alineada).
  for (const it of order.items) {
    t += cols(`${it.quantity}x ${it.productName}`, money(lineTotal(it)), {
      size: "tall",
    });
    if (it.options.length) {
      t += line("   " + it.options.map((o) => o.name).join(", "));
    }
  }
  t += rule();

  t += cols("Subtotal", money(subtotal), { size: "tall" });
  if (order.deliveryFee > 0)
    t += cols("Envio", money(order.deliveryFee), { size: "tall" });
  t += line("");
  // TOTAL: lo que el cliente mira. Lo más grande del ticket.
  t += line("TOTAL  " + money(order.total), { center: true, size: "xl" });
  t += rule();

  t += line("");
  t += line("GRACIAS POR SU COMPRA", { center: true, size: "big", bold: true });
  t += line(store.name, { center: true, size: "tall" });
  t += line("");
  t += footer();
  return t;
}

// Ticket corto para el botón "Imprimir prueba".
export function buildTestTicket(store: StoreInfo): string {
  let t = CMD.init;
  t += line(store.name, { center: true, size: "xl" });
  t += line("PRUEBA DE IMPRESION", { center: true, size: "tall" });
  t += line(fmtDateTime(new Date().toISOString()), { center: true });
  t += rule();
  t += line("Si estas leyendo esto, la comandera", { size: "tall" });
  t += line("quedo conectada a Blend.", { size: "tall" });
  t += rule();
  t += footer();
  return t;
}
