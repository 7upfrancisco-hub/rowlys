// Motor de precios de los descuentos automáticos (Fase 28d). Puro, sin
// Prisma ni nada server-only — se usa TAL CUAL desde el server
// (`createOrder`, que es quien cobra de verdad) y desde el checkout del
// cliente (solo para previsualizar el total antes de confirmar; el server
// nunca confía en este resultado, siempre lo recalcula de cero).
//
// Orden de aplicación (decisión de diseño, documentada para no reinventarla
// cada vez que se toque esto):
//   1. DIRECT sobre cada línea (producto puntual gana sobre categoría si
//      ambos aplicarían al mismo producto — nunca se suman los dos).
//   2. COMBO sobre las unidades ya ajustadas por DIRECT.
//   3. PAYMENT_METHOD sobre el subtotal de productos ya con 1 y 2 aplicados.
//   4. FREE_SHIPPING sobre el envío (no toca el subtotal de productos).
//   5. (Fuera de este módulo) el cupón, si lo hay, se aplica en último
//      lugar sobre lo que quede del subtotal de productos — ver
//      `src/lib/coupons.ts` y cómo lo encadena `createOrder`.

export type DiscountKind = "DIRECT" | "COMBO" | "PAYMENT_METHOD" | "FREE_SHIPPING";
export type DiscountValueType = "PERCENT" | "FIXED";
export type DiscountTarget = "PRODUCT" | "CATEGORY";
export type PaymentProviderLike = "CASH" | "MP" | "MODO" | "BANK_TRANSFER";

export interface DiscountRule {
  id: string;
  kind: DiscountKind;
  title: string;
  active: boolean;
  target: DiscountTarget | null;
  productId: string | null;
  categoryId: string | null;
  valueType: DiscountValueType | null;
  value: number | null;
  triggerProductId: string | null;
  rewardProductId: string | null;
  paymentProvider: PaymentProviderLike | null;
}

export interface PricingLine {
  productId: string;
  categoryId: string | null;
  quantity: number;
  // Precio de producto por unidad (ya con `discountPrice` si correspondía),
  // SIN sumar adicionales — los adicionales no reciben descuento automático.
  unitPrice: number;
  optionsPricePerUnit: number;
}

export interface DiscountApplicationResult {
  discountId: string;
  title: string;
  amount: number;
}

export interface AutomaticDiscountResult {
  itemsTotal: number;
  deliveryFee: number;
  applications: DiscountApplicationResult[];
}

function reduceByRule(unit: number, valueType: DiscountValueType, value: number): number {
  const raw = valueType === "PERCENT" ? unit * (value / 100) : value;
  return Math.min(Math.max(raw, 0), unit);
}

export function priceAutomaticDiscounts(
  lines: PricingLine[],
  orderType: "PICKUP" | "DELIVERY",
  paymentProvider: PaymentProviderLike,
  baseDeliveryFee: number,
  rules: DiscountRule[]
): AutomaticDiscountResult {
  const active = rules.filter((r) => r.active);
  const applications: DiscountApplicationResult[] = [];

  // Estado mutable por línea: precio unitario "vigente" (se reduce con
  // DIRECT y de nuevo con COMBO) y el total restante de esa línea.
  const state = lines.map((line) => ({
    ...line,
    unit: line.unitPrice,
    lineTotal: line.unitPrice * line.quantity,
  }));

  // --- 1) DIRECT ---
  for (const line of state) {
    const productRule = active.find(
      (r) => r.kind === "DIRECT" && r.target === "PRODUCT" && r.productId === line.productId
    );
    const rule =
      productRule ??
      active.find(
        (r) =>
          r.kind === "DIRECT" &&
          r.target === "CATEGORY" &&
          line.categoryId != null &&
          r.categoryId === line.categoryId
      );
    if (!rule || !rule.valueType || rule.value == null) continue;

    const perUnit = reduceByRule(line.unit, rule.valueType, rule.value);
    if (perUnit <= 0) continue;
    const total = perUnit * line.quantity;
    line.unit -= perUnit;
    line.lineTotal -= total;
    applications.push({ discountId: rule.id, title: rule.title, amount: total });
  }

  // --- 2) COMBO ("2x1 / Combo") ---
  const comboRules = active.filter((r) => r.kind === "COMBO");
  for (const rule of comboRules) {
    if (!rule.triggerProductId || !rule.rewardProductId || !rule.valueType || rule.value == null) {
      continue;
    }
    const triggerQty = state
      .filter((l) => l.productId === rule.triggerProductId)
      .reduce((s, l) => s + l.quantity, 0);
    const rewardLines = state.filter((l) => l.productId === rule.rewardProductId);
    const rewardQty = rewardLines.reduce((s, l) => s + l.quantity, 0);
    if (triggerQty === 0 || rewardQty === 0) continue;

    // Mismo producto en ambos lados = 2x1 clásico (cada 2 unidades, 1 se
    // descuenta). Productos distintos = cada unidad del "disparador" habilita
    // el descuento en una unidad del "premiado", tope según lo que haya.
    let unitsToDiscount =
      rule.triggerProductId === rule.rewardProductId
        ? Math.floor(rewardQty / 2)
        : Math.min(triggerQty, rewardQty);
    if (unitsToDiscount <= 0) continue;

    let ruleTotal = 0;
    for (const line of rewardLines) {
      if (unitsToDiscount <= 0) break;
      const take = Math.min(unitsToDiscount, line.quantity);
      const perUnit = reduceByRule(line.unit, rule.valueType, rule.value);
      const total = perUnit * take;
      if (total > 0) {
        // Descuenta proporcional al resto de la línea (mismo criterio que
        // DIRECT: reduce el "unit" vigente, para que si además hay otro
        // combo sobre el mismo producto, encadene sobre el precio correcto).
        line.unit -= perUnit * (take / line.quantity);
        line.lineTotal -= total;
        ruleTotal += total;
      }
      unitsToDiscount -= take;
    }
    if (ruleTotal > 0) {
      applications.push({ discountId: rule.id, title: rule.title, amount: ruleTotal });
    }
  }

  let itemsTotal = state.reduce(
    (sum, l) => sum + Math.max(0, l.lineTotal) + l.optionsPricePerUnit * l.quantity,
    0
  );

  // --- 3) PAYMENT_METHOD ---
  const paymentRules = active.filter(
    (r) => r.kind === "PAYMENT_METHOD" && r.paymentProvider === paymentProvider
  );
  for (const rule of paymentRules) {
    if (!rule.valueType || rule.value == null) continue;
    const amount = reduceByRule(itemsTotal, rule.valueType, rule.value);
    if (amount <= 0) continue;
    itemsTotal -= amount;
    applications.push({ discountId: rule.id, title: rule.title, amount });
  }

  // --- 4) FREE_SHIPPING ---
  let deliveryFee = baseDeliveryFee;
  if (orderType === "DELIVERY" && deliveryFee > 0) {
    const rule = active.find((r) => r.kind === "FREE_SHIPPING");
    if (rule) {
      applications.push({ discountId: rule.id, title: rule.title, amount: deliveryFee });
      deliveryFee = 0;
    }
  }

  return { itemsTotal: Math.max(0, itemsTotal), deliveryFee, applications };
}
