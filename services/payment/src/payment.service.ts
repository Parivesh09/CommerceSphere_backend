import Stripe from 'stripe';
import { v4 as uuidv4 } from 'uuid';
import { pool } from './database';
import { config } from './config';
import { logger, CircuitBreaker, CircuitBreakerOpenError } from '@commercesphere/utils';
import { PaymentRecord, RefundRecord, CreatePaymentRequest, RefundRequest } from './types';
import { PaymentEventPublisher } from './event-publisher';

export class PaymentService {
  private stripe: Stripe;
  private eventPublisher?: PaymentEventPublisher;
  private paymentIntentCircuitBreaker: CircuitBreaker<
    [PaymentRecord, string],
    PaymentRecord
  >;
  private refundCircuitBreaker: CircuitBreaker<
    [RefundRecord, PaymentRecord],
    void
  >;

  constructor(eventPublisher?: PaymentEventPublisher) {
    this.stripe = new Stripe(config.stripe.secretKey, {
      apiVersion: '2023-10-16',
    });
    this.eventPublisher = eventPublisher;


    this.paymentIntentCircuitBreaker = new CircuitBreaker(
      this.processStripePaymentInternal.bind(this),
      {
        name: 'stripe-payment-intent',
        failureThreshold: 5,
        failureTimeWindowMs: 10000,
        resetTimeoutMs: 60000,
        halfOpenMaxAttempts: 3,
        onStateChange: (state) => {
          logger.warn('Stripe payment intent circuit breaker state changed', { state });
        },
      }
    );

    this.refundCircuitBreaker = new CircuitBreaker(
      this.processStripeRefundInternal.bind(this),
      {
        name: 'stripe-refund',
        failureThreshold: 5,
        failureTimeWindowMs: 10000,
        resetTimeoutMs: 60000,
        halfOpenMaxAttempts: 3,
        onStateChange: (state) => {
          logger.warn('Stripe refund circuit breaker state changed', { state });
        },
      }
    );
  }

  async createPayment(request: CreatePaymentRequest): Promise<PaymentRecord> {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      

      const existingPayment = await client.query<PaymentRecord>(
        'SELECT * FROM payments WHERE order_id = $1',
        [request.orderId]
      );
      
      if (existingPayment.rows.length > 0) {
        await client.query('COMMIT');
        logger.info('Payment already exists for order', {
          orderId: request.orderId,
          paymentId: existingPayment.rows[0].id,
        });
        return existingPayment.rows[0];
      }
      

      const paymentId = uuidv4();
      const insertResult = await client.query<PaymentRecord>(
        `INSERT INTO payments (id, order_id, user_id, amount, currency, status, payment_method)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [
          paymentId,
          request.orderId,
          request.userId,
          request.amount,
          request.currency || 'USD',
          'PENDING',
          'stripe',
        ]
      );
      
      const payment = insertResult.rows[0];
      
      await client.query('COMMIT');
      
      logger.info('Payment record created', {
        paymentId: payment.id,
        orderId: payment.order_id,
        amount: payment.amount,
        currency: payment.currency,
      });
      

      this.processStripePayment(payment, request.paymentMethodId).catch((error) => {
        logger.error('Async Stripe payment processing failed', {
          paymentId: payment.id,
          error: error instanceof Error ? error.message : String(error),
        });
      });
      
      return payment;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Failed to create payment', {
        orderId: request.orderId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      client.release();
    }
  }

  private async processStripePayment(
    payment: PaymentRecord,
    paymentMethodId: string
  ): Promise<PaymentRecord> {
    try {
      return await this.paymentIntentCircuitBreaker.execute(payment, paymentMethodId);
    } catch (error) {
      if (error instanceof CircuitBreakerOpenError) {
        logger.error('Stripe payment circuit breaker is open', {
          paymentId: payment.id,
          error: error.message,
        });
        

        const failedPayment = await this.updatePaymentStatus(
          payment.id,
          'FAILED',
          undefined,
          { error: 'Payment service temporarily unavailable' }
        );
        

        if (this.eventPublisher) {
          await this.eventPublisher.publishPaymentFailed(
            failedPayment,
            'Payment service temporarily unavailable'
          );
        }
        
        return failedPayment;
      }
      throw error;
    }
  }

  private async processStripePaymentInternal(
    payment: PaymentRecord,
    paymentMethodId: string
  ): Promise<PaymentRecord> {
    logger.info('Processing Stripe payment', {
      paymentId: payment.id,
      amount: payment.amount,
      currency: payment.currency,
    });
    

    const paymentIntent = await this.stripe.paymentIntents.create({
      amount: Math.round(payment.amount * 100), // Convert to cents
      currency: payment.currency.toLowerCase(),
      payment_method: paymentMethodId,
      confirm: true,
      automatic_payment_methods: {
        enabled: true,
        allow_redirects: 'never',
      },
      metadata: {
        paymentId: payment.id,
        orderId: payment.order_id,
        userId: payment.user_id,
      },
    });
    

    const updatedPayment = await this.updatePaymentStatus(
      payment.id,
      paymentIntent.status === 'succeeded' ? 'COMPLETED' : 'FAILED',
      paymentIntent.id,
      JSON.parse(JSON.stringify(paymentIntent))
    );
    
    if (paymentIntent.status === 'succeeded') {
      logger.info('Stripe payment succeeded', {
        paymentId: payment.id,
        stripePaymentIntentId: paymentIntent.id,
      });
      

      if (this.eventPublisher) {
        await this.eventPublisher.publishPaymentSuccess(updatedPayment);
      }
    } else {
      logger.error('Stripe payment failed', {
        paymentId: payment.id,
        stripePaymentIntentId: paymentIntent.id,
        status: paymentIntent.status,
      });
      

      if (this.eventPublisher) {
        await this.eventPublisher.publishPaymentFailed(
          updatedPayment,
          `Payment intent status: ${paymentIntent.status}`
        );
      }
    }
    
    return updatedPayment;
  }

  async updatePaymentStatus(
    paymentId: string,
    status: 'PENDING' | 'COMPLETED' | 'FAILED' | 'REFUNDED',
    gatewayTransactionId?: string,
    gatewayResponse?: Record<string, unknown>
  ): Promise<PaymentRecord> {
    const client = await pool.connect();
    
    try {
      const result = await client.query<PaymentRecord>(
        `UPDATE payments 
         SET status = $1, 
             gateway_transaction_id = COALESCE($2, gateway_transaction_id),
             gateway_response = COALESCE($3, gateway_response),
             updated_at = NOW()
         WHERE id = $4
         RETURNING *`,
        [status, gatewayTransactionId, JSON.stringify(gatewayResponse), paymentId]
      );
      
      if (result.rows.length === 0) {
        throw new Error(`Payment not found: ${paymentId}`);
      }
      
      logger.info('Payment status updated', {
        paymentId,
        status,
        gatewayTransactionId,
      });
      
      return result.rows[0];
    } finally {
      client.release();
    }
  }

  async getPaymentById(paymentId: string): Promise<PaymentRecord | null> {
    const result = await pool.query<PaymentRecord>(
      'SELECT * FROM payments WHERE id = $1',
      [paymentId]
    );
    
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  async getPaymentByOrderId(orderId: string): Promise<PaymentRecord | null> {
    const result = await pool.query<PaymentRecord>(
      'SELECT * FROM payments WHERE order_id = $1',
      [orderId]
    );
    
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  async getPaymentByGatewayTransactionId(
    gatewayTransactionId: string
  ): Promise<PaymentRecord | null> {
    const result = await pool.query<PaymentRecord>(
      'SELECT * FROM payments WHERE gateway_transaction_id = $1',
      [gatewayTransactionId]
    );
    
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  async createRefund(paymentId: string, request: RefundRequest): Promise<RefundRecord> {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      

      const paymentResult = await client.query<PaymentRecord>(
        'SELECT * FROM payments WHERE id = $1',
        [paymentId]
      );
      
      if (paymentResult.rows.length === 0) {
        throw new Error(`Payment not found: ${paymentId}`);
      }
      
      const payment = paymentResult.rows[0];
      
      if (payment.status !== 'COMPLETED') {
        throw new Error(`Cannot refund payment with status: ${payment.status}`);
      }
      
      if (!payment.gateway_transaction_id) {
        throw new Error('Payment has no gateway transaction ID');
      }
      

      const refundAmount = request.amount || payment.amount;
      
      if (refundAmount > payment.amount) {
        throw new Error('Refund amount cannot exceed payment amount');
      }
      

      const refundId = uuidv4();
      const refundResult = await client.query<RefundRecord>(
        `INSERT INTO refunds (id, payment_id, amount, reason, status)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [refundId, paymentId, refundAmount, request.reason, 'PENDING']
      );
      
      const refund = refundResult.rows[0];
      
      await client.query('COMMIT');
      
      logger.info('Refund record created', {
        refundId: refund.id,
        paymentId,
        amount: refundAmount,
      });
      

      if (this.eventPublisher) {
        await this.eventPublisher.publishRefundInitiated(refund, payment);
      }
      

      this.processStripeRefund(refund, payment).catch((error) => {
        logger.error('Async Stripe refund processing failed', {
          refundId: refund.id,
          error: error instanceof Error ? error.message : String(error),
        });
      });
      
      return refund;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Failed to create refund', {
        paymentId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      client.release();
    }
  }

  private async processStripeRefund(
    refund: RefundRecord,
    payment: PaymentRecord
  ): Promise<void> {
    try {
      await this.refundCircuitBreaker.execute(refund, payment);
    } catch (error) {
      if (error instanceof CircuitBreakerOpenError) {
        logger.error('Stripe refund circuit breaker is open', {
          refundId: refund.id,
          error: error.message,
        });
        

        await this.updateRefundStatus(refund.id, 'FAILED');
        return;
      }
      throw error;
    }
  }

  private async processStripeRefundInternal(
    refund: RefundRecord,
    payment: PaymentRecord
  ): Promise<void> {
    logger.info('Processing Stripe refund', {
      refundId: refund.id,
      paymentId: payment.id,
      amount: refund.amount,
    });
    

    const stripeRefund = await this.stripe.refunds.create({
      payment_intent: payment.gateway_transaction_id!,
      amount: Math.round(refund.amount * 100), // Convert to cents
      reason: 'requested_by_customer',
      metadata: {
        refundId: refund.id,
        paymentId: payment.id,
        orderId: payment.order_id,
      },
    });
    

    await this.updateRefundStatus(
      refund.id,
      stripeRefund.status === 'succeeded' ? 'COMPLETED' : 'FAILED',
      stripeRefund.id
    );
    

    if (refund.amount === payment.amount && stripeRefund.status === 'succeeded') {
      await this.updatePaymentStatus(payment.id, 'REFUNDED');
    }
    
    logger.info('Stripe refund succeeded', {
      refundId: refund.id,
      stripeRefundId: stripeRefund.id,
    });
    

    if (this.eventPublisher) {
      const updatedRefund = await pool.query<RefundRecord>(
        'SELECT * FROM refunds WHERE id = $1',
        [refund.id]
      );
      if (updatedRefund.rows.length > 0) {
        await this.eventPublisher.publishRefundCompleted(updatedRefund.rows[0], payment);
      }
    }
  }

  async updateRefundStatus(
    refundId: string,
    status: 'PENDING' | 'COMPLETED' | 'FAILED',
    gatewayRefundId?: string
  ): Promise<RefundRecord> {
    const client = await pool.connect();
    
    try {
      const result = await client.query<RefundRecord>(
        `UPDATE refunds 
         SET status = $1, 
             gateway_refund_id = COALESCE($2, gateway_refund_id)
         WHERE id = $3
         RETURNING *`,
        [status, gatewayRefundId, refundId]
      );
      
      if (result.rows.length === 0) {
        throw new Error(`Refund not found: ${refundId}`);
      }
      
      logger.info('Refund status updated', {
        refundId,
        status,
        gatewayRefundId,
      });
      
      return result.rows[0];
    } finally {
      client.release();
    }
  }

  async handleStripeWebhook(signature: string, payload: Buffer): Promise<void> {
    try {

      const event = this.stripe.webhooks.constructEvent(
        payload,
        signature,
        config.stripe.webhookSecret
      );
      
      logger.info('Stripe webhook received', {
        eventType: event.type,
        eventId: event.id,
      });
      

      switch (event.type) {
        case 'payment_intent.succeeded':
          await this.handlePaymentIntentSucceeded(event.data.object as Stripe.PaymentIntent);
          break;
        
        case 'payment_intent.payment_failed':
          await this.handlePaymentIntentFailed(event.data.object as Stripe.PaymentIntent);
          break;
        
        case 'charge.refunded':
          await this.handleChargeRefunded(event.data.object as Stripe.Charge);
          break;
        
        default:
          logger.info('Unhandled webhook event type', {
            eventType: event.type,
          });
      }
    } catch (error) {
      logger.error('Webhook signature verification failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private async handlePaymentIntentSucceeded(paymentIntent: Stripe.PaymentIntent): Promise<void> {
    const paymentId = paymentIntent.metadata.paymentId;
    
    if (!paymentId) {
      logger.warn('Payment intent has no paymentId in metadata', {
        paymentIntentId: paymentIntent.id,
      });
      return;
    }
    
    await this.updatePaymentStatus(
      paymentId,
      'COMPLETED',
      paymentIntent.id,
      JSON.parse(JSON.stringify(paymentIntent))
    );
    
    logger.info('Payment intent succeeded webhook processed', {
      paymentId,
      paymentIntentId: paymentIntent.id,
    });
  }

  private async handlePaymentIntentFailed(paymentIntent: Stripe.PaymentIntent): Promise<void> {
    const paymentId = paymentIntent.metadata.paymentId;
    
    if (!paymentId) {
      logger.warn('Payment intent has no paymentId in metadata', {
        paymentIntentId: paymentIntent.id,
      });
      return;
    }
    
    await this.updatePaymentStatus(
      paymentId,
      'FAILED',
      paymentIntent.id,
      JSON.parse(JSON.stringify(paymentIntent))
    );
    
    logger.info('Payment intent failed webhook processed', {
      paymentId,
      paymentIntentId: paymentIntent.id,
    });
  }

  private async handleChargeRefunded(charge: Stripe.Charge): Promise<void> {

    const payment = await this.getPaymentByGatewayTransactionId(
      charge.payment_intent as string
    );
    
    if (!payment) {
      logger.warn('No payment found for refunded charge', {
        chargeId: charge.id,
        paymentIntentId: charge.payment_intent,
      });
      return;
    }
    

    if (charge.refunded) {
      await this.updatePaymentStatus(payment.id, 'REFUNDED');
    }
    
    logger.info('Charge refunded webhook processed', {
      paymentId: payment.id,
      chargeId: charge.id,
    });
  }

  getStripeInstance(): Stripe {
    return this.stripe;
  }
}
