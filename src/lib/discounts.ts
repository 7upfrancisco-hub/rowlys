import { z } from "zod";
import { prisma } from "@/lib/prisma";

// Compartido entre POST /api/admin/discounts y PATCH /api/admin/discounts/[id].
// Vive acá (no en route.ts) porque un route handler de Next.js solo puede
// exportar los métodos HTTP + un puñado de config reservada — cualquier otro
// export ahí rompe el build (chequeo de tipos de rutas de Next).

export const discountInclude = {
  product: { select: { id: true, name: true } },
  category: { select: { id: true, name: true } },
  triggerProduct: { select: { id: true, name: true } },
  rewardProduct: { select: { id: true, name: true } },
} as const;

const baseFields = {
  title: z.string().trim().min(1, "Falta el título."),
  active: z.boolean().optional(),
};

const valueFields = {
  valueType: z.enum(["PERCENT", "FIXED"]),
  value: z.number().positive("El valor tiene que ser mayor a 0."),
};

export const createDiscountSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("DIRECT"),
    ...baseFields,
    ...valueFields,
    target: z.enum(["PRODUCT", "CATEGORY"]),
    productId: z.string().trim().optional(),
    categoryId: z.string().trim().optional(),
  }),
  z.object({
    kind: z.literal("COMBO"),
    ...baseFields,
    ...valueFields,
    triggerProductId: z.string().trim().min(1, "Falta el producto que dispara el combo."),
    rewardProductId: z.string().trim().min(1, "Falta el producto que se descuenta."),
  }),
  z.object({
    kind: z.literal("PAYMENT_METHOD"),
    ...baseFields,
    ...valueFields,
    paymentProvider: z.enum(["CASH", "MP", "BANK_TRANSFER"]),
  }),
  z.object({
    kind: z.literal("FREE_SHIPPING"),
    ...baseFields,
  }),
]);

export type CreateDiscountInput = z.infer<typeof createDiscountSchema>;

// Reglas que cruzan campos y que un discriminatedUnion no puede expresar
// solo. Devuelve el mensaje de error, o null si está todo bien.
export function validateDiscountCrossFields(data: CreateDiscountInput): string | null {
  if ("valueType" in data && data.valueType === "PERCENT" && data.value > 100) {
    return "Un descuento porcentual no puede superar el 100%.";
  }
  if (data.kind === "DIRECT") {
    if (data.target === "PRODUCT" && !data.productId) {
      return "Falta elegir el producto.";
    }
    if (data.target === "CATEGORY" && !data.categoryId) {
      return "Falta elegir la categoría.";
    }
  }
  return null;
}

// Verifica que los productos/categoría referenciados existan y sean del
// mismo tenant, para que un descuento nunca apunte a datos de otro local.
export async function assertDiscountOwnership(
  data: CreateDiscountInput,
  tenantId: string
): Promise<string | null> {
  if (data.kind === "DIRECT" && data.target === "PRODUCT" && data.productId) {
    const p = await prisma.product.findFirst({ where: { id: data.productId, tenantId } });
    if (!p) return "Ese producto no existe.";
  }
  if (data.kind === "DIRECT" && data.target === "CATEGORY" && data.categoryId) {
    const c = await prisma.category.findFirst({ where: { id: data.categoryId, tenantId } });
    if (!c) return "Esa categoría no existe.";
  }
  if (data.kind === "COMBO") {
    const [trigger, reward] = await Promise.all([
      prisma.product.findFirst({ where: { id: data.triggerProductId, tenantId } }),
      prisma.product.findFirst({ where: { id: data.rewardProductId, tenantId } }),
    ]);
    if (!trigger || !reward) return "Alguno de los productos elegidos ya no existe.";
  }
  return null;
}
