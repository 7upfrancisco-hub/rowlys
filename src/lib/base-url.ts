// URL pública base para armar links (seguimiento del pedido, back_urls de
// pagos, etc.). Orden de resolución:
//   1. NEXT_PUBLIC_BASE_URL si está seteada explícitamente.
//   2. VERCEL_PROJECT_PRODUCTION_URL (la inyecta Vercel sola en todos los
//      deployments y equivale al dominio de producción, ej. rowlys.vercel.app).
//   3. localhost para desarrollo.
export function baseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, "");
  if (explicit) return explicit;

  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercel) return `https://${vercel.replace(/\/$/, "")}`;

  return "http://localhost:3000";
}
