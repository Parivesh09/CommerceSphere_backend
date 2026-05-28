# Kafka Event Bus Setup

This document describes the Kafka event bus infrastructure for CommerceSphere.

## Overview

The platform uses Apache Kafka as the event bus for asynchronous communication between microservices. Kafka provides:

- **Reliable event delivery** with at-least-once guarantees
- **Event ordering** within partitions
- **Scalability** through topic partitioning
- **Fault tolerance** through replication
- **Event replay** capability for debugging and recovery

## Topics

The following Kafka topics are configured:

### Main Topics

| Topic | Partitions | Description |
|-------|-----------|-------------|
| `orders` | 3 | Order lifecycle events (created, paid, shipped, delivered, cancelled) |
| `payments` | 3 | Payment events (success, failed, refund initiated, refund completed) |
| `inventory` | 3 | Inventory events (updated, low stock, reservation created, released) |
| `analytics` | 3 | Analytics events (product viewed, order completed, user activity) |
| `notifications` | 3 | Notification events (email, SMS, push notifications) |

### Dead Letter Queues

Each main topic has a corresponding dead letter queue (DLQ) for failed messages:

- `orders.dlq`
- `payments.dlq`
- `inventory.dlq`
- `analytics.dlq`
- `notifications.dlq`

Messages are moved to the DLQ after 3 failed processing attempts.

## Configuration

### Development

In development, Kafka runs in Docker with the following configuration:

```yaml
# docker-compose.yml
kafka:
  image: confluentinc/cp-kafka:7.5.0
  ports:
    - "9092:9092"  # External access
    - "9093:9093"  # Internal access
  environment:
    KAFKA_BROKER_ID: 1
    KAFKA_ZOOKEEPER_CONNECT: zookeeper:2181
    KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://localhost:9092,PLAINTEXT_INTERNAL://kafka:9093
```

### Production

In production, configure:

- **Replication Factor**: 3 (for fault tolerance)
- **Min In-Sync Replicas**: 2
- **Retention**: 7 days (configurable per topic)
- **Compression**: GZIP
- **Multiple Brokers**: 3+ for high availability

## Usage

### Producer

```typescript
import { createKafkaProducer, KAFKA_TOPICS } from '@commercesphere/utils';


const producer = createKafkaProducer({
  brokers: ['localhost:9092'],
  clientId: 'order-service',
});

await producer.connect();


const event: OrderCreatedEvent = {
  id: 'evt-123',
  type: 'order.created',
  aggregateId: 'order-456',
  payload: {
    orderId: 'order-456',
    userId: 'user-789',
    items: [...],
    totalAmount: 99.99,
    shippingAddress: {...},
  },
  timestamp: new Date(),
  version: 1,
};

await producer.publishEvent(KAFKA_TOPICS.ORDERS, event);


await producer.disconnect();
```

### Consumer

```typescript
import { createKafkaConsumer, KAFKA_TOPICS } from '@commercesphere/utils';


const consumer = createKafkaConsumer({
  brokers: ['localhost:9092'],
  groupId: 'payment-service-group',
  clientId: 'payment-service',
  topics: [KAFKA_TOPICS.ORDERS],
});


consumer.registerHandler('order.created', async (event, message) => {
  console.log('Processing order:', event.payload.orderId);

});

await consumer.connect();



await consumer.disconnect();
```

## Features

### Event Buffering

When Kafka is unavailable, the producer automatically buffers events in memory (up to 1000 events) and retries delivery when the connection is restored.

```typescript

await producer.publishEvent(topic, event);



const bufferSize = producer.getBufferSize();
console.log(`Buffered events: ${bufferSize}`);
```

### Retry Logic

The consumer automatically retries failed event processing with exponential backoff:

1. **First retry**: 1 second delay
2. **Second retry**: 5 seconds delay
3. **Third retry**: 15 seconds delay
4. **After 3 failures**: Move to dead letter queue

```typescript

const consumer = createKafkaConsumer(
  {
    brokers: ['localhost:9092'],
    groupId: 'my-service',
    clientId: 'my-service',
    topics: ['orders'],
  },
  {
    maxRetries: 3,
    retryDelays: [1000, 5000, 15000], // milliseconds
  }
);
```

### Dead Letter Queue

Failed messages are automatically moved to the DLQ after exhausting retries:

```typescript

{
  originalTopic: 'orders',
  event: {...},
  error: 'Processing failed: ...',
  errorStack: '...',
  originalMessage: {
    offset: '123',
    partition: 0,
    timestamp: '...',
  },
  movedToDlqAt: '2024-01-15T10:30:00.000Z'
}
```

Monitor DLQ topics for failed messages and investigate/replay as needed.

### Correlation ID Propagation

Correlation IDs are automatically propagated through events for distributed tracing:

```typescript
import { setCorrelationId } from '@commercesphere/utils';


app.post('/orders', async (req, res) => {
  setCorrelationId(req.headers['x-correlation-id']);
  

  await producer.publishEvent(KAFKA_TOPICS.ORDERS, event);
  
  res.json({ orderId: event.payload.orderId });
});
```

## Initialization

### Create Topics

Run the initialization script to create all topics:

```bash
npm run init:kafka
```

This creates:
- All main topics with configured partitions
- Dead letter queues for each topic
- Proper retention and compression settings

### Verify Topics

List all topics:

```bash
docker exec -it commercesphere-kafka kafka-topics --bootstrap-server localhost:9092 --list
```

Describe a topic:

```bash
docker exec -it commercesphere-kafka kafka-topics --bootstrap-server localhost:9092 --describe --topic orders
```

## Monitoring

### Consumer Lag

Monitor consumer lag to ensure consumers are keeping up:

```bash
docker exec -it commercesphere-kafka kafka-consumer-groups --bootstrap-server localhost:9092 --describe --group payment-service-group
```

### Topic Messages

View messages in a topic:

```bash
docker exec -it commercesphere-kafka kafka-console-consumer --bootstrap-server localhost:9092 --topic orders --from-beginning
```

### Dead Letter Queue

Monitor DLQ for failed messages:

```bash
docker exec -it commercesphere-kafka kafka-console-consumer --bootstrap-server localhost:9092 --topic orders.dlq --from-beginning
```

## Best Practices

### Event Design

1. **Immutable Events**: Events should be immutable records of what happened
2. **Self-Contained**: Include all necessary data in the event payload
3. **Versioning**: Use version field for schema evolution
4. **Idempotency**: Design consumers to handle duplicate events

### Error Handling

1. **Transient Errors**: Retry automatically (network issues, temporary unavailability)
2. **Permanent Errors**: Move to DLQ (invalid data, business logic errors)
3. **Logging**: Log all errors with context for debugging
4. **Alerting**: Alert on DLQ messages for investigation

### Performance

1. **Batching**: Use `publishBatch()` for multiple events
2. **Compression**: GZIP compression is enabled by default
3. **Partitioning**: Use meaningful partition keys (e.g., user ID, order ID)
4. **Consumer Groups**: Scale consumers horizontally with consumer groups

### Security

1. **TLS**: Enable TLS for production
2. **SASL**: Use SASL authentication
3. **ACLs**: Configure topic-level access control
4. **Encryption**: Consider encryption at rest

## Troubleshooting

### Producer Cannot Connect

```
Error: Failed to connect Kafka producer
```

**Solution**: Verify Kafka is running and accessible:

```bash
docker ps | grep kafka
docker logs commercesphere-kafka
```

### Consumer Not Receiving Messages

**Check**:
1. Consumer is subscribed to correct topics
2. Consumer group ID is unique per service
3. Messages exist in topic
4. No errors in consumer logs

### Messages in Dead Letter Queue

**Investigate**:
1. Check DLQ message for error details
2. Review consumer logs for error context
3. Fix the issue in consumer code
4. Replay message if needed

### High Consumer Lag

**Solutions**:
1. Scale consumers horizontally (add more instances)
2. Optimize event processing logic
3. Increase partition count for better parallelism
4. Check for slow downstream dependencies

## References

- [KafkaJS Documentation](https://kafka.js.org/)
- [Apache Kafka Documentation](https://kafka.apache.org/documentation/)
- [Confluent Platform](https://docs.confluent.io/)
