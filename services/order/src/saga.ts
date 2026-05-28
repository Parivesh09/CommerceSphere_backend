import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import { pool } from './database';
import { createLogger } from '@commercesphere/utils';
import { OrderStatus, PaymentStatus } from '@commercesphere/types';
import axios from 'axios';
import { getKafkaProducer } from '@commercesphere/utils';
import { KAFKA_TOPICS } from '@commercesphere/utils';

const logger = createLogger({ serviceName: 'order-service' });

export enum SagaStep {
  ORDER_CREATED = 'ORDER_CREATED',
  INVENTORY_RESERVED = 'INVENTORY_RESERVED',
  PAYMENT_REQUESTED = 'PAYMENT_REQUESTED',
  PAYMENT_COMPLETED = 'PAYMENT_COMPLETED',
  ORDER_COMPLETED = 'ORDER_COMPLETED',

  ORDER_CANCELLED = 'ORDER_CANCELLED',
  INVENTORY_RELEASED = 'INVENTORY_RELEASED',
}

export interface SagaState {
  id: string;
  orderId: string;
  currentStep: SagaStep;
  completedSteps: SagaStep[];
  compensationNeeded: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrderItem {
  productId: string;
  variantId?: string;
  quantity: number;
  unitPrice: number;
}

export class OrderSagaOrchestrator {
  constructor(private db: Pool = pool) {}

  /**
   * Initiate the order saga
   * Step 1: Order is already created
   * Step 2: Reserve inventory
   * Step 3: Request payment
   */
  async initiateSaga(orderId: string, items: OrderItem[]): Promise<void> {
    logger.info('Initiating order saga', { orderId });

    try {

      await this.updateSagaState(orderId, SagaStep.ORDER_CREATED, [SagaStep.ORDER_CREATED]);


      await this.reserveInventory(orderId, items);
      await this.updateSagaState(orderId, SagaStep.INVENTORY_RESERVED, [
        SagaStep.ORDER_CREATED,
        SagaStep.INVENTORY_RESERVED,
      ]);


      await this.requestPayment(orderId);
      await this.updateSagaState(orderId, SagaStep.PAYMENT_REQUESTED, [
        SagaStep.ORDER_CREATED,
        SagaStep.INVENTORY_RESERVED,
        SagaStep.PAYMENT_REQUESTED,
      ]);


      await this.updateOrderStatus(orderId, 'PENDING_PAYMENT', 'PENDING');

      logger.info('Order saga initiated successfully', { orderId });
    } catch (error) {
      logger.error('Failed to initiate order saga', {
        orderId,
        error: error instanceof Error ? error.message : String(error),
      });


      await this.compensate(orderId, error);
      throw error;
    }
  }

  /**
   * Handle successful payment
   */
  async handlePaymentSuccess(orderId: string, paymentId: string): Promise<void> {
    logger.info('Handling payment success', { orderId, paymentId });

    const client = await this.db.connect();
    try {
      await client.query('BEGIN');


      const sagaState = await this.getSagaState(orderId);
      if (!sagaState) {
        throw new Error(`Saga state not found for order ${orderId}`);
      }


      if (sagaState.completedSteps.includes(SagaStep.PAYMENT_COMPLETED)) {
        logger.info('Payment already processed for order', { orderId });
        await client.query('COMMIT');
        return;
      }


      await this.updateSagaState(
        orderId,
        SagaStep.PAYMENT_COMPLETED,
        [...sagaState.completedSteps, SagaStep.PAYMENT_COMPLETED]
      );


      await this.convertReservationToPermanent(orderId);


      await client.query(
        `UPDATE orders 
         SET status = $1, payment_status = $2, updated_at = NOW() 
         WHERE id = $3`,
        ['PAID', 'COMPLETED', orderId]
      );


      await this.updateSagaState(
        orderId,
        SagaStep.ORDER_COMPLETED,
        [...sagaState.completedSteps, SagaStep.PAYMENT_COMPLETED, SagaStep.ORDER_COMPLETED]
      );

      await client.query('COMMIT');


      const orderResult = await this.db.query(
        'SELECT total_amount FROM orders WHERE id = $1',
        [orderId]
      );


      try {
        const event = {
          id: uuidv4(),
          type: 'order.paid' as const,
          aggregateId: orderId,
          payload: {
            orderId,
            paymentId,
            amount: orderResult.rows.length > 0 ? parseFloat(orderResult.rows[0].total_amount) : 0,
          },
          timestamp: new Date(),
          version: 1,
        };

        const producer = getKafkaProducer();
        await producer.publishEvent(KAFKA_TOPICS.ORDERS, event);

        logger.info('Order paid event published', { orderId, paymentId });
      } catch (error) {
        logger.error('Failed to publish order paid event', {
          orderId,
          error: error instanceof Error ? error.message : String(error),
        });
      }

      logger.info('Payment success handled successfully', { orderId, paymentId });
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Failed to handle payment success', {
        orderId,
        paymentId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Handle failed payment
   */
  async handlePaymentFailure(orderId: string, reason: string): Promise<void> {
    logger.info('Handling payment failure', { orderId, reason });

    try {

      const sagaState = await this.getSagaState(orderId);
      if (!sagaState) {
        throw new Error(`Saga state not found for order ${orderId}`);
      }


      if (sagaState.compensationNeeded && sagaState.completedSteps.includes(SagaStep.INVENTORY_RELEASED)) {
        logger.info('Payment failure already handled for order', { orderId });
        return;
      }


      await this.compensate(orderId, new Error(`Payment failed: ${reason}`));

      logger.info('Payment failure handled successfully', { orderId });
    } catch (error) {
      logger.error('Failed to handle payment failure', {
        orderId,
        reason,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Handle inventory reservation failure
   */
  async handleInventoryReservationFailure(orderId: string, reason: string): Promise<void> {
    logger.info('Handling inventory reservation failure', { orderId, reason });

    try {

      const sagaState = await this.getSagaState(orderId);
      if (!sagaState) {
        throw new Error(`Saga state not found for order ${orderId}`);
      }


      if (sagaState.compensationNeeded && sagaState.currentStep === SagaStep.ORDER_CANCELLED) {
        logger.info('Inventory reservation failure already handled for order', { orderId });
        return;
      }


      await this.compensate(orderId, new Error(`Inventory reservation failed: ${reason}`));

      logger.info('Inventory reservation failure handled successfully', { orderId });
    } catch (error) {
      logger.error('Failed to handle inventory reservation failure', {
        orderId,
        reason,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Execute compensating transactions
   */
  private async compensate(orderId: string, error: unknown): Promise<void> {
    logger.info('Starting compensation for order', {
      orderId,
      error: error instanceof Error ? error.message : String(error),
    });

    const client = await this.db.connect();
    try {
      await client.query('BEGIN');


      const sagaState = await this.getSagaState(orderId);
      if (!sagaState) {
        throw new Error(`Saga state not found for order ${orderId}`);
      }


      if (sagaState.compensationNeeded) {
        logger.info('Compensation already in progress for order', { orderId });
        await client.query('COMMIT');
        return;
      }


      await client.query(
        `UPDATE order_saga_state 
         SET compensation_needed = true, updated_at = NOW() 
         WHERE order_id = $1`,
        [orderId]
      );


      const completedSteps = sagaState.completedSteps;


      if (completedSteps.includes(SagaStep.PAYMENT_REQUESTED)) {

        logger.info('Payment request will be cancelled via event', { orderId });
      }


      if (completedSteps.includes(SagaStep.INVENTORY_RESERVED)) {
        await this.releaseInventory(orderId);
        await client.query(
          `UPDATE order_saga_state 
           SET current_step = $1, completed_steps = $2, updated_at = NOW() 
           WHERE order_id = $3`,
          [
            SagaStep.INVENTORY_RELEASED,
            JSON.stringify([...completedSteps, SagaStep.INVENTORY_RELEASED]),
            orderId,
          ]
        );
      }


      await client.query(
        `UPDATE orders 
         SET status = $1, updated_at = NOW() 
         WHERE id = $2`,
        ['CANCELLED', orderId]
      );

      await client.query(
        `UPDATE order_saga_state 
         SET current_step = $1, updated_at = NOW() 
         WHERE order_id = $2`,
        [SagaStep.ORDER_CANCELLED, orderId]
      );

      await client.query('COMMIT');


      try {
        const event = {
          id: uuidv4(),
          type: 'order.cancelled' as const,
          aggregateId: orderId,
          payload: {
            orderId,
            reason: error instanceof Error ? error.message : String(error),
          },
          timestamp: new Date(),
          version: 1,
        };

        const producer = getKafkaProducer();
        await producer.publishEvent(KAFKA_TOPICS.ORDERS, event);

        logger.info('Order cancelled event published', { orderId });
      } catch (eventError) {
        logger.error('Failed to publish order cancelled event', {
          orderId,
          error: eventError instanceof Error ? eventError.message : String(eventError),
        });
      }

      logger.info('Compensation completed successfully', { orderId });
    } catch (compensationError) {
      await client.query('ROLLBACK');
      logger.error('Failed to execute compensation', {
        orderId,
        error: compensationError instanceof Error ? compensationError.message : String(compensationError),
      });
      throw compensationError;
    } finally {
      client.release();
    }
  }

  /**
   * Reserve inventory via Product Service
   */
  private async reserveInventory(orderId: string, items: OrderItem[]): Promise<void> {
    const productServiceUrl = process.env.PRODUCT_SERVICE_URL || 'http://localhost:3002';

    try {
      const response = await axios.post(
        `${productServiceUrl}/inventory/reserve`,
        {
          orderId,
          items: items.map(item => ({
            productId: item.productId,
            variantId: item.variantId,
            quantity: item.quantity,
          })),
        },
        {
          timeout: 10000,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      logger.info('Inventory reserved successfully', {
        orderId,
        reservationCount: response.data.reservations?.length || 0,
      });
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const message = error.response?.data?.error?.message || error.message;
        logger.error('Failed to reserve inventory', {
          orderId,
          error: message,
          status: error.response?.status,
        });
        throw new Error(`Inventory reservation failed: ${message}`);
      }
      throw error;
    }
  }

  /**
   * Release inventory via Product Service
   */
  private async releaseInventory(orderId: string): Promise<void> {
    const productServiceUrl = process.env.PRODUCT_SERVICE_URL || 'http://localhost:3002';

    try {
      await axios.post(
        `${productServiceUrl}/inventory/release`,
        { orderId },
        {
          timeout: 10000,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      logger.info('Inventory released successfully', { orderId });
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const message = error.response?.data?.error?.message || error.message;
        

        if (error.response?.status === 404) {
          logger.info('Inventory reservation already released', { orderId });
          return;
        }

        logger.error('Failed to release inventory', {
          orderId,
          error: message,
          status: error.response?.status,
        });
        throw new Error(`Inventory release failed: ${message}`);
      }
      throw error;
    }
  }

  /**
   * Convert reservation to permanent via Product Service
   */
  private async convertReservationToPermanent(orderId: string): Promise<void> {
    const productServiceUrl = process.env.PRODUCT_SERVICE_URL || 'http://localhost:3002';

    try {
      await axios.post(
        `${productServiceUrl}/inventory/convert`,
        { orderId },
        {
          timeout: 10000,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      logger.info('Inventory reservation converted to permanent', { orderId });
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const message = error.response?.data?.error?.message || error.message;
        logger.error('Failed to convert inventory reservation', {
          orderId,
          error: message,
          status: error.response?.status,
        });
        throw new Error(`Inventory conversion failed: ${message}`);
      }
      throw error;
    }
  }

  /**
   * Request payment (publishes event for Payment Service)
   */
  private async requestPayment(orderId: string): Promise<void> {
    try {

      const orderResult = await this.db.query(
        'SELECT * FROM orders WHERE id = $1',
        [orderId]
      );

      if (orderResult.rows.length === 0) {
        throw new Error(`Order not found: ${orderId}`);
      }

      const order = orderResult.rows[0];


      const paymentPendingEvent = {
        id: uuidv4(),
        type: 'order.payment_pending' as const,
        aggregateId: orderId,
        payload: {
          orderId,
          userId: order.user_id,
          amount: parseFloat(order.total_amount),
        },
        timestamp: new Date(),
        version: 1,
      };

      const producer = getKafkaProducer();
      await producer.publishEvent(KAFKA_TOPICS.ORDERS, paymentPendingEvent);

      logger.info('Order payment pending event published', { orderId });


      const event = {
        id: uuidv4(),
        type: 'payment.requested' as const,
        aggregateId: orderId,
        payload: {
          orderId,
          userId: order.user_id,
          amount: parseFloat(order.total_amount),
          currency: 'USD',
        },
        timestamp: new Date(),
        version: 1,
      };

      await producer.publishEvent(KAFKA_TOPICS.PAYMENTS, event);

      logger.info('Payment requested event published', { orderId });
    } catch (error) {
      logger.error('Failed to request payment', {
        orderId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get saga state for an order
   */
  private async getSagaState(orderId: string): Promise<SagaState | null> {
    const result = await this.db.query(
      `SELECT id, order_id as "orderId", current_step as "currentStep", 
              completed_steps as "completedSteps", compensation_needed as "compensationNeeded",
              created_at as "createdAt", updated_at as "updatedAt"
       FROM order_saga_state 
       WHERE order_id = $1`,
      [orderId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      ...row,
      completedSteps: JSON.parse(row.completedSteps),
    };
  }

  /**
   * Update saga state
   */
  private async updateSagaState(
    orderId: string,
    currentStep: SagaStep,
    completedSteps: SagaStep[]
  ): Promise<void> {
    await this.db.query(
      `UPDATE order_saga_state 
       SET current_step = $1, completed_steps = $2, updated_at = NOW() 
       WHERE order_id = $3`,
      [currentStep, JSON.stringify(completedSteps), orderId]
    );

    logger.info('Saga state updated', { orderId, currentStep, completedSteps });
  }

  /**
   * Update order status
   */
  private async updateOrderStatus(
    orderId: string,
    status: OrderStatus,
    paymentStatus: PaymentStatus
  ): Promise<void> {
    await this.db.query(
      `UPDATE orders 
       SET status = $1, payment_status = $2, updated_at = NOW() 
       WHERE id = $3`,
      [status, paymentStatus, orderId]
    );

    logger.info('Order status updated', { orderId, status, paymentStatus });
  }
}

export const orderSagaOrchestrator = new OrderSagaOrchestrator();
