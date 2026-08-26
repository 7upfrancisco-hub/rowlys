import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.product.deleteMany();
  await prisma.category.deleteMany();

  const entradas = await prisma.category.create({
    data: { name: "Entradas", order: 1 },
  });
  const principales = await prisma.category.create({
    data: { name: "Platos principales", order: 2 },
  });
  const bebidas = await prisma.category.create({
    data: { name: "Bebidas", order: 3 },
  });
  const postres = await prisma.category.create({
    data: { name: "Postres", order: 4 },
  });

  await prisma.product.createMany({
    data: [
      {
        name: "Empanadas de carne (x3)",
        description: "Empanadas caseras al horno, carne cortada a cuchillo",
        price: 4200,
        categoryId: entradas.id,
      },
      {
        name: "Provoleta",
        description: "Con orégano y aceite de oliva",
        price: 5800,
        categoryId: entradas.id,
      },
      {
        name: "Milanesa napolitana",
        description: "Con papas fritas o puré",
        price: 12500,
        categoryId: principales.id,
      },
      {
        name: "Bife de chorizo",
        description: "350g, con guarnición a elección",
        price: 16800,
        categoryId: principales.id,
      },
      {
        name: "Pastel de papa",
        description: "Con carne, cebolla y aceitunas",
        price: 10200,
        categoryId: principales.id,
      },
      {
        name: "Agua sin gas 500ml",
        price: 2200,
        categoryId: bebidas.id,
      },
      {
        name: "Gaseosa línea Coca-Cola 500ml",
        price: 2800,
        categoryId: bebidas.id,
      },
      {
        name: "Cerveza artesanal IPA",
        price: 4500,
        categoryId: bebidas.id,
      },
      {
        name: "Flan casero",
        description: "Con dulce de leche y crema",
        price: 3800,
        categoryId: postres.id,
      },
      {
        name: "Helado (2 bochas)",
        price: 3400,
        categoryId: postres.id,
      },
    ],
  });

  await prisma.settings.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton", deliveryFee: 500, storeName: "Rowlys" },
  });

  console.log("Seed completo ✅");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
