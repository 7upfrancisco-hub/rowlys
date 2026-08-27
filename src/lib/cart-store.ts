import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CartLine, OrderType } from "@/types";

function lineKey(line: Pick<CartLine, "productId" | "options" | "notes">): string {
  const optionIds = (line.options ?? []).map((o) => o.optionId).sort();
  const notes = line.notes?.trim();
  return `${line.productId}|${optionIds.join(",")}${notes ? `|${notes}` : ""}`;
}

export function cartLineKey(line: CartLine): string {
  return lineKey(line);
}

export function cartSubtotal(lines: CartLine[]): number {
  return lines.reduce((sum, line) => {
    const optionsPrice = (line.options ?? []).reduce((s, o) => s + o.price, 0);
    return sum + (line.price + optionsPrice) * line.quantity;
  }, 0);
}

interface CartState {
  orderType: OrderType;
  lines: CartLine[];
  setOrderType: (orderType: OrderType) => void;
  addLine: (line: Omit<CartLine, "quantity"> & { quantity?: number }) => void;
  updateQuantity: (key: string, quantity: number) => void;
  removeLine: (key: string) => void;
  clear: () => void;
}

export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      orderType: "PICKUP",
      lines: [],
      setOrderType: (orderType) => set({ orderType }),
      addLine: (line) =>
        set((state) => {
          const quantity = line.quantity ?? 1;
          const key = lineKey(line);
          const existing = state.lines.find((l) => lineKey(l) === key);
          if (existing) {
            return {
              lines: state.lines.map((l) =>
                lineKey(l) === key ? { ...l, quantity: l.quantity + quantity } : l
              ),
            };
          }
          return { lines: [...state.lines, { ...line, quantity }] };
        }),
      updateQuantity: (key, quantity) =>
        set((state) => {
          if (quantity <= 0) {
            return { lines: state.lines.filter((l) => lineKey(l) !== key) };
          }
          return {
            lines: state.lines.map((l) =>
              lineKey(l) === key ? { ...l, quantity } : l
            ),
          };
        }),
      removeLine: (key) =>
        set((state) => ({ lines: state.lines.filter((l) => lineKey(l) !== key) })),
      clear: () => set({ lines: [] }),
    }),
    { name: "rowlys-cart" }
  )
);
