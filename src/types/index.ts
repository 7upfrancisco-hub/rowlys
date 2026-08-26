export type OrderStatus =
  | "PENDING"
  | "IN_PROGRESS"
  | "READY"
  | "DELIVERED"
  | "CANCELLED";

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING: "Pendiente",
  IN_PROGRESS: "En preparación",
  READY: "Listo",
  DELIVERED: "Entregado",
  CANCELLED: "Cancelado",
};

export const ORDER_STATUS_FLOW: OrderStatus[] = [
  "PENDING",
  "IN_PROGRESS",
  "READY",
  "DELIVERED",
];

export type OrderType = "PICKUP" | "DELIVERY";

export const ORDER_TYPE_LABELS: Record<OrderType, string> = {
  PICKUP: "Retiro en el local",
  DELIVERY: "Envío a domicilio",
};

export type PaymentProvider = "CASH" | "MP" | "MODO";

export const PAYMENT_PROVIDER_LABELS: Record<PaymentProvider, string> = {
  CASH: "Efectivo",
  MP: "Mercado Pago",
  MODO: "Modo",
};

export type PaymentStatus = "PENDING" | "CONFIRMED" | "FAILED";

export interface CartLine {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  notes?: string;
}

export interface ProductDTO {
  id: string;
  name: string;
  description: string | null;
  price: number;
  imageUrl: string | null;
  available: boolean;
  categoryId: string;
}

export interface CategoryDTO {
  id: string;
  name: string;
  order: number;
  products: ProductDTO[];
}

export interface OrderItemDTO {
  id: string;
  productId: string;
  productName: string;
  price: number;
  quantity: number;
  notes: string | null;
}

export interface PaymentDTO {
  id: string;
  provider: PaymentProvider;
  status: PaymentStatus;
  amount: number;
  providerRef: string | null;
}

export interface OrderDTO {
  id: string;
  orderType: OrderType;
  customerName: string;
  customerPhone: string;
  deliveryAddress: string | null;
  deliveryFee: number;
  total: number;
  status: OrderStatus;
  notes: string | null;
  items: OrderItemDTO[];
  payment: PaymentDTO | null;
  createdAt: string;
  updatedAt: string;
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(value);
}
