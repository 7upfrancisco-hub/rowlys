export class ApiError extends Error {}

export async function apiFetch<T>(
  input: string,
  init?: RequestInit
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(input, {
      headers: { "Content-Type": "application/json" },
      ...init,
    });
  } catch {
    throw new ApiError("No se pudo conectar con el servidor.");
  }

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new ApiError(data?.error ?? `Error inesperado (${res.status}).`);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}
