import { v4 as uuidv4 } from 'uuid';
import { createKafkaProducer, KafkaEventProducer } from '@commercesphere/utils';
import { PaymentSuccessEvent, PaymentFailedEvent } from '@commercesphere/types';
import { config } from './config';
import { logger } from '@commercesphere/utils';
import { PaymentRecord, RefundRecord } from './types';

export class PaymentEventPublisher {
  private producer: KafkaEventProducer;

  constructor() {
    this.producer = createKafkaProducer({
      brokers: config.kafka.brokers,
      clientId: config.kafka.clientId,
    });
  }

  async connect(): Promise<void> {
    await this.producer.connect();
    logger.info('Payment event publisher connected');
  }

  async disconnect(): Promise<void> {
    await this.producer.disconnect();
    logger.info('Payment event publisher disconnected');
  }

  async publishPaymentSuccess(payment: PaymentRecord): Promise<void> {
    const event: PaymentSuccessEvent = {
      id: uuidv4(),
      type: 'payment.success',
      aggregateId: payment.id,
      payload: {
        paymentId: payment.id,
        orderId: payment.order_id,
        amount: payment.amount,
        gatewayTransactionId: payment.gateway_transaction_id || '',
      },
      timestamp: new Date(),
      version: 1,
    };

    await this.producer.publishEvent('payments', event);

    logger.info('Payment success event published', {
      paymentId: payment.id,
      orderId: payment.order_id,
      eventId: event.id,
    });
  }

  async publishPaymentFailed(payment: PaymentRecord, reason: string): Promise<void> {
    const event: PaymentFailedEvent = {
      id: uuidv4(),
      type: 'payment.failed',
      aggregateId: payment.id,
      payload: {
        paymentId: payment.id,
        orderId: payment.order_id,
        reason,
      },
      timestamp: new Date(),
      version: 1,
    };

    await this.producer.publishEvent('payments', event);

    logger.info('Payment failed event published', {
      paymentId: payment.id,
      orderId: payment.order_id,
      reason,
      eventId: event.id,
    });
  }

  async publishRefundInitiated(refund: RefundRecord, payment: PaymentRecord): Promise<void> {
    const event = {
      id: uuidv4(),
      type: 'payment.refund_initiated',
      aggregateId: refund.id,
      payload: {
        refundId: refund.id,
        paymentId: payment.id,
        orderId: payment.order_id,
        amount: refund.amount,
        reason: refund.reason,
      },
      timestamp: new Date(),
      version: 1,
    };

    await this.producer.publishEvent('payments', event);

    logger.info('Refund initiated event published', {
      refundId: refund.id,
      paymentId: payment.id,
      orderId: payment.order_id,
      eventId: event.id,
    });
  }

  async publishRefundCompleted(refund: RefundRecord, payment: PaymentRecord): Promise<void> {
    const event = {
      id: uuidv4(),
      type: 'payment.refund_completed',
      aggregateId: refund.id,
      payload: {
        refundId: refund.id,
        paymentId: payment.id,
        orderId: payment.order_id,
        amount: refund.amount,
        gatewayRefundId: refund.gateway_refund_id,
      },
      timestamp: new Date(),
      version: 1,
    };

    await this.producer.publishEvent('payments', event);

    logger.info('Refund completed event published', {
      refundId: refund.id,
      paymentId: payment.id,
      orderId: payment.order_id,
      eventId: event.id,
    });
  }
}
