// Backfill de la tabla Customer a partir de los pedidos existentes.
//
// Correr UNA vez, después de `prisma db push` con el modelo Customer nuevo:
//   npx tsx prisma/backfill-customers.ts
//
// Es idempotente: se puede volver a correr sin duplicar nada. Agrupa los
// pedidos por teléfono normalizado, crea/actualiza el Customer y linkea cada
// Order a su cliente. Los pedidos sin teléfono normalizable quedan sin linkear.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { normalizeArPhone } from "../src/lib/phone";

// Carga .env / .env.local a mano (tsx no lo hace solo, y no hay dotenv en el
// proyecto). Solo setea claves que no estén ya en el entorno.
for (const file of [".env", ".env.local"]) {
  try {
    const text = readFileSync(resolve(process.cwd(), file), "utf8");
    for (const line of text.split("\n")) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      const key = m[1];
      let val = m[2].trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = val;
    }
  } catch {
    /* el archivo puede no existir */
  }
}

const prisma = new PrismaClient();

async function main() {
  const orders = await prisma.order.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      customerId: true,
      customerFirstName: true,
      customerLastName: true,
      customerPhone: true,
      customerEmail: true,
      createdAt: true,
    },
  });

  const seen = new Map<string, string>(); // phoneKey -> customerId
  let linked = 0;
  let skipped = 0;

  for (const o of orders) {
    const key = normalizeArPhone(o.customerPhone);
    if (!key) {
      skipped++;
      continue;
    }

    let customerId = seen.get(key);
    if (!customerId) {
      const customer = await prisma.customer.upsert({
        where: { phone: key },
        create: {
          phone: key,
          firstName: o.customerFirstName,
          lastName: o.customerLastName,
          email: o.customerEmail ?? undefined,
          // La fecha del primer pedido (recorremos asc, este es el más viejo).
          createdAt: o.createdAt,
        },
        update: {
          // Recorremos de viejo a nuevo, así que el último pedido gana.
          firstName: o.customerFirstName,
          lastName: o.customerLastName,
          ...(o.customerEmail ? { email: o.customerEmail } : {}),
        },
        select: { id: true },
      });
      customerId = customer.id;
      seen.set(key, customerId);
    }

    if (o.customerId !== customerId) {
      await prisma.order.update({
        where: { id: o.id },
        data: { customerId },
      });
      linked++;
    }
  }

  console.log(
    `Clientes: ${seen.size}. Pedidos linkeados ahora: ${linked}. ` +
      `Pedidos sin teléfono válido: ${skipped}. Total pedidos: ${orders.length}.`
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
