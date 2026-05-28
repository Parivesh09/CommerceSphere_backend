import { createKafkaConsumer, KafkaEventConsumer } from '@commercesphere/utils';
import { 
  DomainEvent, 
  OrderCreatedEvent, 
  OrderCancelledEvent 
} from '@commercesphere/types';
import { config } from './config';
import { logger } from '@commercesphere/utils';
import { PaymentService } from './payment.service';

export class PaymentEventConsumer {
  private consumer: KafkaEventConsumer;
  private paymentService: PaymentService;

  constructor(paymentService: PaymentService) {
    this.paymentService = paymentService;
    
    this.consumer = createKafkaConsumer({
      brokers: config.kafka.brokers,
      groupId: config.kafka.groupId,
      clientId: config.kafka.clientId,
      topics: ['orders'],
      fromBeginning: false,
    });
    
    this.registerHandlers();
  }

  private registerHandlers(): void {
    this.consumer.registerHandler('order.created', this.handleOrderCreated.bind(this));
    this.consumer.registerHandler('order.cancelled', this.handleOrderCancelled.bind(this));
  }

  private async handleOrderCreated(event: DomainEvent): Promise<void> {
    const orderEvent = event as OrderCreatedEvent;
    
    logger.info('Processing order.created event', {
      orderId: orderEvent.payload.orderId,
      userId: orderEvent.payload.userId,
      amount: orderEvent.payload.totalAmount,
    });
    



    
    logger.info('Order created - awaiting payment request', {
      orderId: orderEvent.payload.orderId,
    });
  }

  private async handleOrderCancelled(event: DomainEvent): Promise<void> {
    const orderEvent = event as OrderCancelledEvent;
    
    logger.info('Processing order.cancelled event', {
      orderId: orderEvent.payload.orderId,
      reason: orderEvent.payload.reason,
    });
    

    const payment = await this.paymentService.getPaymentByOrderId(
      orderEvent.payload.orderId
    );
    
    if (payment && payment.status === 'COMPLETED') {
      logger.info('Order cancelled with completed payment - initiating refund', {
        orderId: orderEvent.payload.orderId,
        paymentId: payment.id,
      });
      

      try {
        await this.paymentService.createRefund(payment.id, {
          reason: `Order cancelled: ${orderEvent.payload.reason}`,
        });
        
        logger.info('Refund initiated for cancelled order', {
          orderId: orderEvent.payload.orderId,
          paymentId: payment.id,
        });
      } catch (error) {
        logger.error('Failed to initiate refund for cancelled order', {
          orderId: orderEvent.payload.orderId,
          paymentId: payment.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  async start(): Promise<void> {
    await this.consumer.connect();
    logger.info('Payment event consumer started');
  }

  async stop(): Promise<void> {
    await this.consumer.disconnect();
    logger.info('Payment event consumer stopped');
  }
}
