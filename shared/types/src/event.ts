import { Address } from './common';

export interface DomainEvent {
  id: string;
  type: string;
  aggregateId: string;
  payload: Record<string, any>;
  timestamp: Date;
  version: number;
}


export interface OrderCreatedEvent extends DomainEvent {
  type: 'order.created';
  payload: {
    orderId: string;
    userId: string;
    items: Array<{
      productId: string;
      variantId?: string;
      quantity: number;
      unitPrice: number;
    }>;
    totalAmount: number;
    shippingAddress: Address;
  };
}

export interface OrderPaidEvent extends DomainEvent {
  type: 'order.paid';
  payload: {
    orderId: string;
    paymentId: string;
    amount: number;
  };
}

export interface OrderCancelledEvent extends DomainEvent {
  type: 'order.cancelled';
  payload: {
    orderId: string;
    reason: string;
  };
}

export interface OrderPaymentPendingEvent extends DomainEvent {
  type: 'order.payment_pending';
  payload: {
    orderId: string;
    userId: string;
    amount: number;
  };
}

export interface OrderShippedEvent extends DomainEvent {
  type: 'order.shipped';
  payload: {
    orderId: string;
    trackingNumber?: string;
    carrier?: string;
  };
}

export interface OrderDeliveredEvent extends DomainEvent {
  type: 'order.delivered';
  payload: {
    orderId: string;
    deliveredAt: Date;
  };
}


export interface PaymentRequestedEvent extends DomainEvent {
  type: 'payment.requested';
  payload: {
    orderId: string;
    userId: string;
    amount: number;
    currency: string;
  };
}

export interface PaymentSuccessEvent extends DomainEvent {
  type: 'payment.success';
  payload: {
    paymentId: string;
    orderId: string;
    amount: number;
    gatewayTransactionId: string;
  };
}

export interface PaymentFailedEvent extends DomainEvent {
  type: 'payment.failed';
  payload: {
    paymentId: string;
    orderId: string;
    reason: string;
  };
}


export interface ProductCreatedEvent extends DomainEvent {
  type: 'product.created';
  payload: {
    productId: string;
    title: string;
    price: number;
    categoryId: string;
  };
}

export interface ProductUpdatedEvent extends DomainEvent {
  type: 'product.updated';
  payload: {
    productId: string;
    changes: Record<string, any>;
  };
}

export interface ProductDeletedEvent extends DomainEvent {
  type: 'product.deleted';
  payload: {
    productId: string;
  };
}

export interface InventoryUpdatedEvent extends DomainEvent {
  type: 'inventory.updated';
  payload: {
    productId: string;
    variantId?: string;
    previousQuantity: number;
    newQuantity: number;
  };
}

export interface InventoryLowStockEvent extends DomainEvent {
  type: 'inventory.low_stock';
  payload: {
    productId: string;
    variantId?: string;
    currentQuantity: number;
    threshold: number;
  };
}

export interface InventoryReservationFailedEvent extends DomainEvent {
  type: 'inventory.reservation_failed';
  payload: {
    orderId: string;
    reason: string;
  };
}
