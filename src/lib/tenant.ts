// Contexto de tenant para las rutas protegidas (Fase 26b). middleware.ts ya
// validó la sesión y resolvió el tenant; acá solo se define el nombre del
// header por el que viaja (para no repetirlo hardcodeado en dos archivos) y
// un helper para leerlo del lado de la route handler.
export const TENANT_HEADER = "x-tenant-id";

// Lee el tenantId que middleware.ts puso en el request. Si no está (no
// debería pasar nunca en una ruta cubierta por el matcher de
// middleware.ts), tira: es un bug de configuración, no un caso de negocio a
// manejar con un 4xx silencioso.
export function requireTenantId(request: Request): string {
  const tenantId = request.headers.get(TENANT_HEADER);
  if (!tenantId) {
    throw new Error(
      "Falta el contexto de tenant en el request — ¿la ruta no está cubierta por el matcher de middleware.ts?"
    );
  }
  return tenantId;
}
