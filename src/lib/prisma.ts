import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

// Sin `relationMode = "prisma"`, las FK sin cascade las hace cumplir Postgres
// directamente: la violación llega como PrismaClientUnknownRequestError (no
// el P2003 que Prisma sólo emite cuando él mismo emula la restricción), así
// que hay que detectarla por el mensaje del error de Postgres.
export function isForeignKeyViolation(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return /foreign key constraint/i.test(err.message);
}
