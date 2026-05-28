import { createKafkaConsumer, EventHandler } from '@commercesphere/utils';
import { KAFKA_TOPICS } from '@commercesphere/utils';
import { createLogger } from '@commercesphere/utils';
import { PaymentSuccessEvent, PaymentFailedEvent, InventoryReservationFailedEvent, DomainEvent } from '@commercesphere/types';
import { orderSagaOrchestrator } from './saga';
import { config } from './config';

const logger = createLogger({ serviceName: 'order-service' });

export class OrderEventConsumer {
  private consumer: ReturnType<typeof createKafkaConsumer> | null = null;

  async start(): Promise<void> {
    try {

      this.consumer = createKafkaConsumer({
        brokers: config.kafka.brokers,
        groupId: 'order-service-group',
        clientId: 'order-service',
        topics: [KAFKA_TOPICS.PAYMENTS, KAFKA_TOPICS.INVENTORY],
        fromBeginning: false,
      });


      this.consumer.registerHandler('payment.success', this.handlePaymentSuccess);
      this.consumer.registerHandler('payment.failed', this.handlePaymentFailure);
      this.consumer.registerHandler('inventory.reservation_failed', this.handleInventoryReservationFailure);


      await this.consumer.connect();

      logger.info('Order event consumer started', {
        topics: [KAFKA_TOPICS.PAYMENTS, KAFKA_TOPICS.INVENTORY],
      });
    } catch (error) {
      logger.error('Failed to start order event consumer', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (this.consumer) {
      await this.consumer.disconnect();
      logger.info('Order event consumer stopped');
    }
  }

  /**
   * Handle payment success event
   */
  private handlePaymentSuccess: EventHandler = async (event: DomainEvent) => {
    const paymentEvent = event as PaymentSuccessEvent;
    const { orderId, paymentId, amount } = paymentEvent.payload;

    logger.info('Received payment success event', {
      orderId,
      paymentId,
      amount,
      eventId: event.id,
    });

    try {
      await orderSagaOrchestrator.handlePaymentSuccess(orderId, paymentId);

      logger.info('Payment success event processed successfully', {
        orderId,
        paymentId,
      });
    } catch (error) {
      logger.error('Failed to process payment success event', {
        orderId,
        paymentId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error; // Will trigger retry logic
    }
  };

  /**
   * Handle payment failure event
   */
  private handlePaymentFailure: EventHandler = async (event: DomainEvent) => {
    const paymentEvent = event as PaymentFailedEvent;
    const { orderId, reason } = paymentEvent.payload;

    logger.info('Received payment failed event', {
      orderId,
      reason,
      eventId: event.id,
    });

    try {
      await orderSagaOrchestrator.handlePaymentFailure(orderId, reason);

      logger.info('Payment failure event processed successfully', {
        orderId,
        reason,
      });
    } catch (error) {
      logger.error('Failed to process payment failure event', {
        orderId,
        reason,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error; // Will trigger retry logic
    }
  };

  /**
   * Handle inventory reservation failure event
   */
  private handleInventoryReservationFailure: EventHandler = async (event: DomainEvent) => {
    const inventoryEvent = event as InventoryReservationFailedEvent;
    const { orderId, reason } = inventoryEvent.payload;

    logger.info('Received inventory reservation failed event', {
      orderId,
      reason,
      eventId: event.id,
    });

    try {
      await orderSagaOrchestrator.handleInventoryReservationFailure(orderId, reason);

      logger.info('Inventory reservation failure event processed successfully', {
        orderId,
        reason,
      });
    } catch (error) {
      logger.error('Failed to process inventory reservation failure event', {
        orderId,
        reason,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error; // Will trigger retry logic
    }
  };
}

export const orderEventConsumer = new OrderEventConsumer();
