import { DomainEvent } from '@commercesphere/types';
import { createLogger, createKafkaConsumer, KafkaEventConsumer } from '@commercesphere/utils';
import { config } from './config';
import { notificationService } from './notification.service';
import { NotificationContext } from './types';

const logger = createLogger({ serviceName: 'notification-service' });

let consumer: KafkaEventConsumer | null = null;

export async function startEventConsumer(): Promise<void> {
  consumer = createKafkaConsumer({
    brokers: config.kafka.brokers,
    groupId: config.kafka.groupId,
    clientId: config.kafka.clientId,
    topics: ['orders', 'payments'],
    fromBeginning: false,
  });


  consumer.registerHandler('order.created', handleOrderCreated);
  consumer.registerHandler('payment.success', handlePaymentSuccess);
  consumer.registerHandler('order.shipped', handleOrderShipped);
  consumer.registerHandler('order.delivered', handleOrderDelivered);
  consumer.registerHandler('order.cancelled', handleOrderCancelled);

  await consumer.connect();
  
  logger.info('Event consumer started', {
    topics: ['orders', 'payments'],
    groupId: config.kafka.groupId,
  });
}

export async function stopEventConsumer(): Promise<void> {
  if (consumer) {
    await consumer.disconnect();
    logger.info('Event consumer stopped');
  }
}

async function handleOrderCreated(event: DomainEvent): Promise<void> {
  logger.info('Processing order.created event', {
    eventId: event.id,
    aggregateId: event.aggregateId,
  });

  const { userId, orderId, totalAmount } = event.payload;

  const context: NotificationContext = {
    orderId,
    amount: totalAmount,
  };

  await notificationService.createNotification(
    userId,
    'ORDER_CREATED',
    context
  );
}

async function handlePaymentSuccess(event: DomainEvent): Promise<void> {
  logger.info('Processing payment.success event', {
    eventId: event.id,
    aggregateId: event.aggregateId,
  });

  const { userId, orderId, amount } = event.payload;

  const context: NotificationContext = {
    orderId,
    amount,
  };

  await notificationService.createNotification(
    userId,
    'PAYMENT_SUCCESS',
    context
  );
}

async function handleOrderShipped(event: DomainEvent): Promise<void> {
  logger.info('Processing order.shipped event', {
    eventId: event.id,
    aggregateId: event.aggregateId,
  });

  const { userId, orderId, trackingNumber } = event.payload;

  const context: NotificationContext = {
    orderId,
    trackingNumber,
  };

  await notificationService.createNotification(
    userId,
    'ORDER_SHIPPED',
    context
  );
}

async function handleOrderDelivered(event: DomainEvent): Promise<void> {
  logger.info('Processing order.delivered event', {
    eventId: event.id,
    aggregateId: event.aggregateId,
  });

  const { userId, orderId } = event.payload;

  const context: NotificationContext = {
    orderId,
  };

  await notificationService.createNotification(
    userId,
    'ORDER_DELIVERED',
    context
  );
}

async function handleOrderCancelled(event: DomainEvent): Promise<void> {
  logger.info('Processing order.cancelled event', {
    eventId: event.id,
    aggregateId: event.aggregateId,
  });

  const { userId, orderId } = event.payload;

  const context: NotificationContext = {
    orderId,
  };

  await notificationService.createNotification(
    userId,
    'ORDER_CANCELLED',
    context
  );
}
