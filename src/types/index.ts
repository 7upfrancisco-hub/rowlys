export type OrderStatus =
  | "PENDING"
  | "CONFIRMED"
  | "IN_PROGRESS"
  | "READY"
  | "DELIVERED"
  | "CANCELLED";

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING: "Pendiente",
  CONFIRMED: "Confirmado",
  IN_PROGRESS: "En preparación",
  READY: "Listo",
  DELIVERED: "Entregado",
  CANCELLED: "Cancelado",
};

export const ORDER_STATUS_FLOW: OrderStatus[] = [
  "PENDING",
  "CONFIRMED",
  "IN_PROGRESS",
  "READY",
  "DELIVERED",
];

export type OrderType = "PICKUP" | "DELIVERY";

export const ORDER_TYPE_LABELS: Record<OrderType, string> = {
  PICKUP: "Retiro en el local",
  DELIVERY: "Envío a domicilio",
};

export type PaymentProvider = "CASH" | "MP" | "MODO" | "BANK_TRANSFER";

export const PAYMENT_PROVIDER_LABELS: Record<PaymentProvider, string> = {
  CASH: "Efectivo",
  MP: "Mercado Pago",
  MODO: "Modo",
  BANK_TRANSFER: "Transferencia bancaria",
};

export type PaymentStatus = "PENDING" | "CONFIRMED" | "FAILED";

export type ModifierType = "SINGLE" | "MULTIPLE" | "REMOVE";

export interface ModifierOptionDTO {
  id: string;
  title: string;
  price: number;
  active: boolean;
}

export interface ModifierGroupDTO {
  id: string;
  name: string;
  type: ModifierType;
  min: number;
  max: number;
  active: boolean;
  options: ModifierOptionDTO[];
}

export interface CartLineOption {
  optionId: string;
  name: string;
  price: number;
}

export interface CartLine {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  notes?: string;
  options?: CartLineOption[];
}

export interface ProductDTO {
  id: string;
  name: string;
  description: string | null;
  price: number;
  discountPrice: number | null;
  imageUrl: string | null;
  available: boolean;
  availableDelivery: boolean;
  availablePickup: boolean;
  categoryId: string;
  modifierGroups: ModifierGroupDTO[];
}

export interface CategoryDTO {
  id: string;
  name: string;
  order: number;
  products: ProductDTO[];
}

export interface OrderItemOptionDTO {
  id: string;
  name: string;
  price: number;
}

export interface OrderItemDTO {
  id: string;
  productId: string | null;
  productName: string;
  price: number;
  quantity: number;
  notes: string | null;
  options: OrderItemOptionDTO[];
}

export interface PaymentDTO {
  id: string;
  provider: PaymentProvider;
  status: PaymentStatus;
  amount: number;
  changeFor: number | null;
  providerRef: string | null;
}

export interface DriverDTO {
  id: string;
  name: string;
  phone: string;
  vehicle: string | null;
  licensePlate: string | null;
  documentId: string | null;
  address: string | null;
  notes: string | null;
  active: boolean;
}

// Versión reducida que viaja dentro de un pedido.
export interface OrderDriverDTO {
  id: string;
  name: string;
  phone: string;
}

export interface OrderDTO {
  id: string;
  number: number;
  orderType: OrderType;
  customerFirstName: string;
  customerLastName: string;
  customerPhone: string;
  customerEmail: string | null;
  deliveryAddress: string | null;
  deliveryFee: number;
  total: number;
  status: OrderStatus;
  extraDelayMinutes: number;
  notes: string | null;
  items: OrderItemDTO[];
  payment: PaymentDTO | null;
  driverId: string | null;
  driver: OrderDriverDTO | null;
  createdAt: string;
  updatedAt: string;
}

// Resultado del intento de aviso por WhatsApp al confirmar un pedido. Lo
// devuelve PATCH /api/admin/orders/[id] junto con el pedido actualizado.
export type WhatsAppSendResult =
  | { status: "sent"; to: string; id?: string }
  | { status: "mock"; to: string; body: string }
  | { status: "skipped"; reason: string }
  | { status: "failed"; error: string };

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(value);
}
