import { Address, OrderStatus, PaymentStatus } from '@commercesphere/types';

export interface CreateOrderRequest {
  userId: string;
  items: Array<{
    productId: string;
    variantId?: string;
    quantity: number;
    unitPrice: number;
  }>;
  shippingAddress: Address;
}

export interface OrderResponse {
  id: string;
  userId: string;
  status: OrderStatus;
  totalAmount: number;
  paymentStatus: PaymentStatus;
  shippingAddress: Address;
  items: Array<{
    id: string;
    productId: string;
    variantId?: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
  }>;
  createdAt: Date;
  updatedAt: Date;
}

export interface CancelOrderRequest {
  reason?: string;
}

export interface ShipOrderRequest {
  trackingNumber?: string;
  carrier?: string;
}

export interface DeliverOrderRequest {
  deliveredAt?: Date;
}
