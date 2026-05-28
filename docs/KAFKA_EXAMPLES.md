# Kafka Event Bus Examples

This document provides practical examples of using the Kafka event bus utilities.

## Setup

First, ensure Kafka is running:

```bash
docker-compose up -d kafka zookeeper
```

Initialize topics:

```bash
npm run init:kafka
```

## Producer Examples

### Basic Event Publishing

```typescript
import {
  createKafkaProducer,
  KAFKA_TOPICS,
  getKafkaProducer,
} from '@commercesphere/utils';
import { OrderCreatedEvent } from '@commercesphere/types';


const producer = createKafkaProducer({
  brokers: process.env.KAFKA_BROKERS?.split(',') || ['localhost:9092'],
  clientId: 'order-service',
});

await producer.connect();


const event: OrderCreatedEvent = {
  id: 'evt-' + Date.now(),
  type: 'order.created',
  aggregateId: 'order-123',
  payload: {
    orderId: 'order-123',
    userId: 'user-456',
    items: [
      {
        productId: 'prod-789',
        quantity: 2,
        unitPrice: 49.99,
      },
    ],
    totalAmount: 99.98,
    shippingAddress: {
      street: '123 Main St',
      city: 'San Francisco',
      state: 'CA',
      postalCode: '94102',
      country: 'US',
    },
  },
  timestamp: new Date(),
  version: 1,
};

await producer.publishEvent(KAFKA_TOPICS.ORDERS, event);


process.on('SIGTERM', async () => {
  await producer.disconnect();
});
```

### Batch Publishing

```typescript
import { createKafkaProducer, KAFKA_TOPICS } from '@commercesphere/utils';
import { InventoryUpdatedEvent } from '@commercesphere/types';

const producer = getKafkaProducer();

const events: InventoryUpdatedEvent[] = [
  {
    id: 'evt-1',
    type: 'inventory.updated',
    aggregateId: 'prod-1',
    payload: {
      productId: 'prod-1',
      previousQuantity: 100,
      newQuantity: 95,
    },
    timestamp: new Date(),
    version: 1,
  },
  {
    id: 'evt-2',
    type: 'inventory.updated',
    aggregateId: 'prod-2',
    payload: {
      productId: 'prod-2',
      previousQuantity: 50,
      newQuantity: 48,
    },
    timestamp: new Date(),
    version: 1,
  },
];

await producer.publishBatch(KAFKA_TOPICS.INVENTORY, events);
```

### Event Buffering During Outages

```typescript

const producer = getKafkaProducer();


await producer.publishEvent(KAFKA_TOPICS.ORDERS, event);


console.log(`Buffered events: ${producer.getBufferSize()}`);



```

## Consumer Examples

### Basic Event Consumption

```typescript
import {
  createKafkaConsumer,
  KAFKA_TOPICS,
} from '@commercesphere/utils';
import { OrderCreatedEvent } from '@commercesphere/types';


const consumer = createKafkaConsumer({
  brokers: process.env.KAFKA_BROKERS?.split(',') || ['localhost:9092'],
  groupId: 'payment-service-group',
  clientId: 'payment-service',
  topics: [KAFKA_TOPICS.ORDERS],
});


consumer.registerHandler('order.created', async (event, message) => {
  const orderEvent = event as OrderCreatedEvent;
  
  console.log('Processing order:', orderEvent.payload.orderId);
  

  await processPayment(orderEvent.payload);
  
  console.log('Payment processed successfully');
});


await consumer.connect();


process.on('SIGTERM', async () => {
  await consumer.disconnect();
});
```

### Multiple Event Handlers

```typescript
import { createKafkaConsumer, KAFKA_TOPICS } from '@commercesphere/utils';

const consumer = createKafkaConsumer({
  brokers: ['localhost:9092'],
  groupId: 'notification-service-group',
  clientId: 'notification-service',
  topics: [KAFKA_TOPICS.ORDERS, KAFKA_TOPICS.PAYMENTS],
});


consumer.registerHandler('order.created', async (event) => {
  await sendOrderConfirmationEmail(event.payload);
});


consumer.registerHandler('payment.success', async (event) => {
  await sendPaymentConfirmationEmail(event.payload);
});


consumer.registerHandler('order.shipped', async (event) => {
  await sendShippingNotification(event.payload);
});

await consumer.connect();
```

### Custom Retry Configuration

```typescript
import { createKafkaConsumer, KAFKA_TOPICS } from '@commercesphere/utils';

const consumer = createKafkaConsumer(
  {
    brokers: ['localhost:9092'],
    groupId: 'analytics-service-group',
    clientId: 'analytics-service',
    topics: [KAFKA_TOPICS.ANALYTICS],
  },
  {
    maxRetries: 5, // Retry up to 5 times
    retryDelays: [1000, 2000, 5000, 10000, 30000], // Custom delays
  }
);

consumer.registerHandler('product.viewed', async (event) => {

  await updateAnalytics(event.payload);
});

await consumer.connect();
```

### Error Handling

```typescript
consumer.registerHandler('order.created', async (event, message) => {
  try {

    if (!event.payload.orderId) {
      throw new Error('Invalid order: missing orderId');
    }
    

    await processOrder(event.payload);
    
  } catch (error) {

    console.error('Failed to process order', {
      eventId: event.id,
      orderId: event.payload.orderId,
      error: error.message,
    });
    

    throw error;
  }
});
```

## Service Integration Examples

### Order Service

```typescript

import { createKafkaProducer, KAFKA_TOPICS } from '@commercesphere/utils';
import { OrderCreatedEvent, OrderPaidEvent } from '@commercesphere/types';

export class OrderEventPublisher {
  private producer = createKafkaProducer({
    brokers: process.env.KAFKA_BROKERS?.split(',') || ['localhost:9092'],
    clientId: 'order-service',
  });

  async init() {
    await this.producer.connect();
  }

  async publishOrderCreated(order: Order): Promise<void> {
    const event: OrderCreatedEvent = {
      id: `evt-${Date.now()}`,
      type: 'order.created',
      aggregateId: order.id,
      payload: {
        orderId: order.id,
        userId: order.userId,
        items: order.items,
        totalAmount: order.totalAmount,
        shippingAddress: order.shippingAddress,
      },
      timestamp: new Date(),
      version: 1,
    };

    await this.producer.publishEvent(KAFKA_TOPICS.ORDERS, event);
  }

  async publishOrderPaid(orderId: string, paymentId: string, amount: number): Promise<void> {
    const event: OrderPaidEvent = {
      id: `evt-${Date.now()}`,
      type: 'order.paid',
      aggregateId: orderId,
      payload: {
        orderId,
        paymentId,
        amount,
      },
      timestamp: new Date(),
      version: 1,
    };

    await this.producer.publishEvent(KAFKA_TOPICS.ORDERS, event);
  }

  async shutdown() {
    await this.producer.disconnect();
  }
}
```

### Payment Service

```typescript

import {
  createKafkaConsumer,
  createKafkaProducer,
  KAFKA_TOPICS,
} from '@commercesphere/utils';
import { OrderCreatedEvent, PaymentSuccessEvent } from '@commercesphere/types';

export class PaymentEventHandler {
  private consumer = createKafkaConsumer({
    brokers: process.env.KAFKA_BROKERS?.split(',') || ['localhost:9092'],
    groupId: 'payment-service-group',
    clientId: 'payment-service',
    topics: [KAFKA_TOPICS.ORDERS],
  });

  private producer = createKafkaProducer({
    brokers: process.env.KAFKA_BROKERS?.split(',') || ['localhost:9092'],
    clientId: 'payment-service',
  });

  async init() {
    await this.producer.connect();
    

    this.consumer.registerHandler('order.created', this.handleOrderCreated.bind(this));
    
    await this.consumer.connect();
  }

  private async handleOrderCreated(event: OrderCreatedEvent): Promise<void> {
    const { orderId, totalAmount } = event.payload;


    const payment = await this.processPayment(orderId, totalAmount);


    const successEvent: PaymentSuccessEvent = {
      id: `evt-${Date.now()}`,
      type: 'payment.success',
      aggregateId: payment.id,
      payload: {
        paymentId: payment.id,
        orderId,
        amount: totalAmount,
        gatewayTransactionId: payment.gatewayTransactionId,
      },
      timestamp: new Date(),
      version: 1,
    };

    await this.producer.publishEvent(KAFKA_TOPICS.PAYMENTS, successEvent);
  }

  private async processPayment(orderId: string, amount: number) {

    return {
      id: `pay-${Date.now()}`,
      orderId,
      amount,
      gatewayTransactionId: `txn-${Date.now()}`,
    };
  }

  async shutdown() {
    await this.consumer.disconnect();
    await this.producer.disconnect();
  }
}
```

### Notification Service

```typescript

import { createKafkaConsumer, KAFKA_TOPICS } from '@commercesphere/utils';
import {
  OrderCreatedEvent,
  PaymentSuccessEvent,
  OrderShippedEvent,
} from '@commercesphere/types';

export class NotificationEventHandler {
  private consumer = createKafkaConsumer({
    brokers: process.env.KAFKA_BROKERS?.split(',') || ['localhost:9092'],
    groupId: 'notification-service-group',
    clientId: 'notification-service',
    topics: [KAFKA_TOPICS.ORDERS, KAFKA_TOPICS.PAYMENTS],
  });

  async init() {
    this.consumer.registerHandler('order.created', this.handleOrderCreated.bind(this));
    this.consumer.registerHandler('payment.success', this.handlePaymentSuccess.bind(this));
    this.consumer.registerHandler('order.shipped', this.handleOrderShipped.bind(this));
    
    await this.consumer.connect();
  }

  private async handleOrderCreated(event: OrderCreatedEvent): Promise<void> {
    await this.sendEmail({
      to: event.payload.userId,
      subject: `Order Confirmation - ${event.payload.orderId}`,
      template: 'order-confirmation',
      data: event.payload,
    });
  }

  private async handlePaymentSuccess(event: PaymentSuccessEvent): Promise<void> {
    await this.sendEmail({
      to: event.payload.orderId,
      subject: 'Payment Confirmed',
      template: 'payment-confirmation',
      data: event.payload,
    });
  }

  private async handleOrderShipped(event: any): Promise<void> {
    await this.sendEmail({
      to: event.payload.userId,
      subject: 'Your Order Has Shipped',
      template: 'order-shipped',
      data: event.payload,
    });
  }

  private async sendEmail(options: any): Promise<void> {

    console.log('Sending email:', options);
  }

  async shutdown() {
    await this.consumer.disconnect();
  }
}
```

## Testing

### Unit Testing with Mock Kafka

```typescript

import { createKafkaProducer } from '@commercesphere/utils';

describe('KafkaEventProducer', () => {
  let producer: any;

  beforeEach(() => {
    producer = createKafkaProducer({
      brokers: ['localhost:9092'],
      clientId: 'test-client',
    });
  });

  afterEach(async () => {
    if (producer.isConnected()) {
      await producer.disconnect();
    }
  });

  it('should buffer events when not connected', async () => {
    const event = {
      id: 'test-1',
      type: 'test.event',
      aggregateId: 'test',
      payload: {},
      timestamp: new Date(),
      version: 1,
    };

    await producer.publishEvent('test-topic', event);
    
    expect(producer.getBufferSize()).toBe(1);
  });
});
```

## Monitoring

### Check Consumer Lag

```bash
docker exec -it commercesphere-kafka kafka-consumer-groups \
  --bootstrap-server localhost:9092 \
  --describe \
  --group payment-service-group
```

### View Dead Letter Queue

```bash
docker exec -it commercesphere-kafka kafka-console-consumer \
  --bootstrap-server localhost:9092 \
  --topic orders.dlq \
  --from-beginning \
  --property print.key=true \
  --property print.headers=true
```

### Replay Failed Messages

```typescript

import { createKafkaConsumer, createKafkaProducer } from '@commercesphere/utils';

async function replayDLQ(originalTopic: string) {
  const dlqTopic = `${originalTopic}.dlq`;
  
  const consumer = createKafkaConsumer({
    brokers: ['localhost:9092'],
    groupId: 'dlq-replay-group',
    clientId: 'dlq-replay',
    topics: [dlqTopic],
  });

  const producer = createKafkaProducer({
    brokers: ['localhost:9092'],
    clientId: 'dlq-replay',
  });

  await producer.connect();
  await consumer.connect();

  consumer.registerHandler('*', async (event) => {

    await producer.publishEvent(originalTopic, event);
    console.log(`Replayed event ${event.id} to ${originalTopic}`);
  });
}
```

## Best Practices

1. **Always use correlation IDs** for distributed tracing
2. **Handle errors gracefully** and let retry logic work
3. **Make consumers idempotent** to handle duplicate events
4. **Monitor dead letter queues** and investigate failures
5. **Use meaningful partition keys** for event ordering
6. **Batch events when possible** for better performance
7. **Set appropriate timeouts** for event processing
8. **Log all event processing** with context
9. **Test with Testcontainers** for integration tests
10. **Scale consumers horizontally** with consumer groups
