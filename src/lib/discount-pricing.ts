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
//   3. PAYMENT_METHOD sobre el subtotal de productos ya con 1 y 2 aplicados
//      (un solo ganador si hay varias reglas activas para el mismo medio de
//      pago — el de mayor descuento, nunca se acumulan).
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
  kind: DiscountKind;
  title: string;
  amount: number;
}

export interface AutomaticDiscountResult {
  itemsTotal: number;
  deliveryFee: number;
  applications: DiscountApplicationResult[];
}

// Redondea a centavos, mismo criterio que `priceCoupon` (src/lib/coupons.ts)
// — antes este motor no redondeaba y podía arrastrar ruido de punto
// flotante que después contaminaba el total final.
function reduceByRule(unit: number, valueType: DiscountValueType, value: number): number {
  const raw = valueType === "PERCENT" ? unit * (value / 100) : value;
  const clamped = Math.min(Math.max(raw, 0), unit);
  return Math.round(clamped * 100) / 100;
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
  // DIRECT) y el total restante de esa línea. `comboAvailableQty` lleva
  // cuenta de cuántas unidades de la línea todavía no fueron tomadas por
  // ninguna regla COMBO (ver más abajo).
  const state = lines.map((line) => ({
    ...line,
    unit: line.unitPrice,
    lineTotal: line.unitPrice * line.quantity,
    comboAvailableQty: line.quantity,
  }));

  // Solo cuentan como candidatas las reglas DIRECT con un valor utilizable —
  // una regla activa pero a medio configurar (value/valueType en null) no
  // debe "ganarle" en silencio a una regla de categoría que sí sirve.
  const usableDirectRules = active.filter(
    (r) => r.kind === "DIRECT" && r.valueType != null && r.value != null
  );

  // --- 1) DIRECT ---
  for (const line of state) {
    const productRule = usableDirectRules.find(
      (r) => r.target === "PRODUCT" && r.productId === line.productId
    );
    const rule =
      productRule ??
      usableDirectRules.find(
        (r) =>
          r.target === "CATEGORY" &&
          line.categoryId != null &&
          r.categoryId === line.categoryId
      );
    if (!rule) continue;

    const perUnit = reduceByRule(line.unit, rule.valueType!, rule.value!);
    if (perUnit <= 0) continue;
    const total = perUnit * line.quantity;
    line.unit -= perUnit;
    line.lineTotal -= total;
    applications.push({ discountId: rule.id, kind: rule.kind, title: rule.title, amount: total });
  }

  // --- 2) COMBO ("2x1 / Combo") ---
  // `comboAvailableQty` (no `quantity`) es el tope real de unidades "premiadas"
  // que quedan: si dos reglas COMBO distintas premian el mismo producto, la
  // segunda regla ya no puede tomar las unidades que la primera se quedó —
  // evita descontar dos veces la misma unidad física. Tampoco se toca
  // `line.unit` acá (a diferencia de antes): como el descuento puede ser
  // parcial (solo algunas unidades de la línea), promediarlo sobre toda la
  // línea corrompía el precio que leería una regla siguiente. `line.unit` se
  // deja tal cual quedó después de DIRECT (que sí aplica a la línea entera) y
  // cada regla COMBO calcula su `perUnit` sobre esa misma base estable.
  const comboRules = active.filter((r) => r.kind === "COMBO");
  for (const rule of comboRules) {
    if (!rule.triggerProductId || !rule.rewardProductId || !rule.valueType || rule.value == null) {
      continue;
    }
    const triggerQty = state
      .filter((l) => l.productId === rule.triggerProductId)
      .reduce((s, l) => s + l.quantity, 0);
    const rewardLines = state.filter((l) => l.productId === rule.rewardProductId);
    const rewardAvailableQty = rewardLines.reduce((s, l) => s + l.comboAvailableQty, 0);
    if (triggerQty === 0 || rewardAvailableQty === 0) continue;

    // Mismo producto en ambos lados = 2x1 clásico (cada 2 unidades, 1 se
    // descuenta). Productos distintos = cada unidad del "disparador" habilita
    // el descuento en una unidad del "premiado", tope según lo que haya
    // disponible (sin contar lo que ya tomó otra regla COMBO).
    let unitsToDiscount =
      rule.triggerProductId === rule.rewardProductId
        ? Math.floor(rewardAvailableQty / 2)
        : Math.min(triggerQty, rewardAvailableQty);
    if (unitsToDiscount <= 0) continue;

    let ruleTotal = 0;
    for (const line of rewardLines) {
      if (unitsToDiscount <= 0) break;
      const take = Math.min(unitsToDiscount, line.comboAvailableQty);
      if (take <= 0) continue;
      const perUnit = reduceByRule(line.unit, rule.valueType, rule.value);
      const total = perUnit * take;
      if (total > 0) {
        line.lineTotal -= total;
        ruleTotal += total;
      }
      line.comboAvailableQty -= take;
      unitsToDiscount -= take;
    }
    if (ruleTotal > 0) {
      applications.push({ discountId: rule.id, kind: rule.kind, title: rule.title, amount: ruleTotal });
    }
  }

  let itemsTotal = state.reduce(
    (sum, l) => sum + Math.max(0, l.lineTotal) + l.optionsPricePerUnit * l.quantity,
    0
  );

  // --- 3) PAYMENT_METHOD (un solo ganador, mismo criterio que DIRECT: nunca
  // se suman dos reglas para el mismo medio de pago) ---
  const paymentRules = active.filter(
    (r) =>
      r.kind === "PAYMENT_METHOD" &&
      r.paymentProvider === paymentProvider &&
      r.valueType != null &&
      r.value != null
  );
  let bestPaymentRule: { rule: DiscountRule; amount: number } | null = null;
  for (const rule of paymentRules) {
    const amount = reduceByRule(itemsTotal, rule.valueType!, rule.value!);
    if (amount > 0 && (!bestPaymentRule || amount > bestPaymentRule.amount)) {
      bestPaymentRule = { rule, amount };
    }
  }
  if (bestPaymentRule) {
    itemsTotal -= bestPaymentRule.amount;
    applications.push({
      discountId: bestPaymentRule.rule.id,
      kind: bestPaymentRule.rule.kind,
      title: bestPaymentRule.rule.title,
      amount: bestPaymentRule.amount,
    });
  }

  // --- 4) FREE_SHIPPING ---
  let deliveryFee = baseDeliveryFee;
  if (orderType === "DELIVERY" && deliveryFee > 0) {
    const rule = active.find((r) => r.kind === "FREE_SHIPPING");
    if (rule) {
      applications.push({ discountId: rule.id, kind: rule.kind, title: rule.title, amount: deliveryFee });
      deliveryFee = 0;
    }
  }

  // Redondeo final defensivo: aunque cada reducción ya se redondea, restar
  // números de 2 decimales entre sí todavía puede arrastrar ruido de punto
  // flotante (ej. 0.1 + 0.2).
  const roundedItemsTotal = Math.round(Math.max(0, itemsTotal) * 100) / 100;
  return { itemsTotal: roundedItemsTotal, deliveryFee, applications };
}
