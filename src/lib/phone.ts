// Utilidades de teléfono, puras y sin dependencias — se usan tanto en el
// servidor (aviso automático por Cloud API) como en el cliente (botón manual de
// WhatsApp en /comanda), por eso viven acá y no dentro de notifications/.

// Normaliza un teléfono argentino a E.164 sin "+" para WhatsApp: `549` + área
// (2-4 díg.) + número local (6-8 díg.), total 13 dígitos. Meta exige el `9` de
// móvil para Argentina. Maneja los formatos comunes que carga la gente:
// +54, 0054, prefijo 0 de larga distancia, prefijo 15 de celular, y el 9.
// Si no llega a 10 dígitos de "área + local" limpios, devuelve null.
export function normalizeArPhone(raw: string): string | null {
  let d = (raw ?? "").replace(/\D/g, "");
  if (!d) return null;

  if (d.startsWith("0054")) d = d.slice(4);
  else if (d.startsWith("54")) d = d.slice(2);
  if (d.startsWith("9")) d = d.slice(1); // se re-agrega al final
  if (d.startsWith("0")) d = d.slice(1); // prefijo larga distancia

  // Prefijo 15 (viejo de celular) entre el área y el número local.
  const m = d.match(/^(\d{2,4})15(\d{6,8})$/);
  if (m) d = m[1] + m[2];

  if (d.length !== 10) return null;
  return "549" + d;
}

// Arma un link de "click to chat" de WhatsApp con el mensaje pre-cargado.
// Devuelve null si el teléfono no se puede normalizar (el que llama decide qué
// hacer: deshabilitar el botón, avisar, etc.).
export function whatsappLink(phone: string, text: string): string | null {
  const to = normalizeArPhone(phone);
  if (!to) return null;
  return `https://wa.me/${to}?text=${encodeURIComponent(text)}`;
}
