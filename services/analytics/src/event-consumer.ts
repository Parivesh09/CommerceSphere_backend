import { createKafkaConsumer, EventHandler } from '@commercesphere/utils';
import { KAFKA_TOPICS } from '@commercesphere/utils';
import { createLogger } from '@commercesphere/utils';
import { DomainEvent } from '@commercesphere/types';
import { analyticsService } from './analytics.service';
import { config } from './config';

const logger = createLogger({ serviceName: 'analytics-service' });

export class AnalyticsEventConsumer {
  private consumer: ReturnType<typeof createKafkaConsumer> | null = null;

  async start(): Promise<void> {
    try {

      this.consumer = createKafkaConsumer({
        brokers: config.kafka.brokers,
        groupId: 'analytics-service-group',
        clientId: 'analytics-service',
        topics: [KAFKA_TOPICS.ORDERS, KAFKA_TOPICS.PAYMENTS, KAFKA_TOPICS.ANALYTICS],
        fromBeginning: false,
      });


      this.consumer.registerHandler('order.created', this.handleOrderCreated);
      this.consumer.registerHandler('order.completed', this.handleOrderCompleted);
      this.consumer.registerHandler('payment.success', this.handlePaymentSuccess);
      this.consumer.registerHandler('product.viewed', this.handleProductViewed);


      await this.consumer.connect();

      logger.info('Analytics event consumer started', {
        topics: [KAFKA_TOPICS.ORDERS, KAFKA_TOPICS.PAYMENTS, KAFKA_TOPICS.ANALYTICS],
      });
    } catch (error) {
      logger.error('Failed to start analytics event consumer', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (this.consumer) {
      await this.consumer.disconnect();
      logger.info('Analytics event consumer stopped');
    }
  }

  /**
   * Handle order created event
   */
  private handleOrderCreated: EventHandler = async (event: DomainEvent) => {
    const { orderId, userId, totalAmount, items } = event.payload;

    logger.info('Received order.created event', {
      orderId,
      userId,
      totalAmount,
      eventId: event.id,
    });

    try {

      await analyticsService.updateOrderMetrics(orderId, userId, totalAmount);


      if (items && Array.isArray(items)) {
        for (const item of items) {
          await analyticsService.updateProductMetrics(
            item.productId,
            'purchase',
            item.unitPrice * item.quantity
          );
        }
      }

      logger.info('Order created event processed successfully', { orderId });
    } catch (error) {
      logger.error('Failed to process order created event', {
        orderId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  };

  /**
   * Handle order completed event
   */
  private handleOrderCompleted: EventHandler = async (event: DomainEvent) => {
    const { orderId, userId, totalAmount } = event.payload;

    logger.info('Received order.completed event', {
      orderId,
      userId,
      totalAmount,
      eventId: event.id,
    });

    try {

      await analyticsService.updateOrderMetrics(orderId, userId, totalAmount);

      logger.info('Order completed event processed successfully', { orderId });
    } catch (error) {
      logger.error('Failed to process order completed event', {
        orderId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  };

  /**
   * Handle payment success event
   */
  private handlePaymentSuccess: EventHandler = async (event: DomainEvent) => {
    const { orderId, paymentId, amount } = event.payload;

    logger.info('Received payment.success event', {
      orderId,
      paymentId,
      amount,
      eventId: event.id,
    });

    try {


      logger.info('Payment success event processed successfully', { orderId, paymentId });
    } catch (error) {
      logger.error('Failed to process payment success event', {
        orderId,
        paymentId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  };

  /**
   * Handle product viewed event
   */
  private handleProductViewed: EventHandler = async (event: DomainEvent) => {
    const { productId, userId } = event.payload;

    logger.info('Received product.viewed event', {
      productId,
      userId,
      eventId: event.id,
    });

    try {

      await analyticsService.updateProductMetrics(productId, 'view');

      logger.info('Product viewed event processed successfully', { productId });
    } catch (error) {
      logger.error('Failed to process product viewed event', {
        productId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  };
}

export const analyticsEventConsumer = new AnalyticsEventConsumer();
