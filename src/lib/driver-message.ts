import {
  formatCurrency,
  PAYMENT_PROVIDER_LABELS,
  type OrderDTO,
} from "@/types";

// Código corto de pedido para nombrarlo por teléfono/WhatsApp. El id es un cuid
// largo; usamos los últimos 6 caracteres en mayúscula (p. ej. "A1B2C3").
export function orderCode(id: string): string {
  return id.slice(-6).toUpperCase();
}

// Mensaje para el repartidor con todo lo que necesita para el reparto.
export function buildDriverMessage(order: OrderDTO, storeName: string): string {
  const L: string[] = [];

  L.push(`🛵 Reparto — ${storeName}`);
  L.push(`Pedido ${orderCode(order.id)}`);
  L.push("");

  const fullName = `${order.customerFirstName} ${order.customerLastName}`.trim();
  L.push(`Cliente: ${fullName}`);
  if (order.customerPhone && order.customerPhone !== "—") {
    L.push(`Tel.: ${order.customerPhone}`);
  }

  if (order.deliveryAddress) {
    L.push(`Dirección: ${order.deliveryAddress}`);
    L.push(
      `Mapa: https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        order.deliveryAddress
      )}`
    );
  }

  L.push("");
  L.push("Pedido:");
  for (const item of order.items) {
    L.push(`• ${item.quantity}x ${item.productName}`);
    if (item.options.length > 0) {
      L.push(`   (${item.options.map((o) => o.name).join(", ")})`);
    }
  }

  L.push("");
  L.push(cobroLine(order));

  if (order.notes) {
    L.push("");
    L.push(`Nota: ${order.notes}`);
  }

  return L.join("\n");
}

function cobroLine(order: OrderDTO): string {
  const total = formatCurrency(order.total);
  const paid = order.payment?.status === "CONFIRMED";
  const method = order.payment?.provider;
  const methodLabel = method ? PAYMENT_PROVIDER_LABELS[method] : "pago";

  if (paid) {
    return `✅ YA PAGÓ (${methodLabel}) — no cobrar nada.`;
  }
  if (method === "CASH") {
    let line = `💵 COBRAR EN EFECTIVO: ${total}`;
    const changeFor = order.payment?.changeFor ?? 0;
    if (changeFor > order.total) {
      line +=
        `\nPaga con ${formatCurrency(changeFor)} — llevá vuelto ` +
        `${formatCurrency(changeFor - order.total)}.`;
    }
    return line;
  }
  return `⚠️ A COBRAR: ${total} (${methodLabel} — sin confirmar).`;
}
