import { Request } from 'express';

export interface PaymentRecord {
  id: string;
  order_id: string;
  user_id: string;
  amount: number;
  currency: string;
  status: 'PENDING' | 'COMPLETED' | 'FAILED' | 'REFUNDED';
  payment_method?: string;
  gateway_transaction_id?: string;
  gateway_response?: any;
  created_at: Date;
  updated_at: Date;
}

export interface RefundRecord {
  id: string;
  payment_id: string;
  amount: number;
  reason?: string;
  status: 'PENDING' | 'COMPLETED' | 'FAILED';
  gateway_refund_id?: string;
  created_at: Date;
}

export interface CreatePaymentRequest {
  orderId: string;
  userId: string;
  amount: number;
  currency?: string;
  paymentMethodId: string;
}

export interface RefundRequest {
  amount?: number;
  reason?: string;
}

export interface StripeWebhookRequest extends Request {
  rawBody?: Buffer;
}

export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: any;
    timestamp: string;
    path: string;
    correlationId?: string;
  };
}
