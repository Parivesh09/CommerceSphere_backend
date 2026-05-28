import { Kafka, Producer } from 'kafkajs';
import { config } from './config';
import { createLogger } from '@commercesphere/utils';
import { ProductCreatedEvent, ProductUpdatedEvent, ProductDeletedEvent, InventoryUpdatedEvent, InventoryLowStockEvent } from '@commercesphere/types';
import { v4 as uuidv4 } from 'uuid';

const logger = createLogger({ serviceName: 'product-service' });

export class EventPublisher {
  private kafka: Kafka;
  private producer: Producer;
  private connected: boolean = false;

  constructor() {
    this.kafka = new Kafka({
      clientId: config.kafka.clientId,
      brokers: config.kafka.brokers,
    });
    this.producer = this.kafka.producer();
  }

  async connect(): Promise<void> {
    try {
      await this.producer.connect();
      this.connected = true;
      logger.info('Kafka producer connected');
    } catch (error) {
      logger.error('Failed to connect Kafka producer', { error });
      throw error;
    }
  }

  async publishProductCreated(productId: string, title: string, price: number, categoryId: string): Promise<void> {
    const event: ProductCreatedEvent = {
      id: uuidv4(),
      type: 'product.created',
      aggregateId: productId,
      payload: {
        productId,
        title,
        price,
        categoryId,
      },
      timestamp: new Date(),
      version: 1,
    };

    await this.publish('products', event);
  }

  async publishProductUpdated(productId: string, changes: Record<string, any>): Promise<void> {
    const event: ProductUpdatedEvent = {
      id: uuidv4(),
      type: 'product.updated',
      aggregateId: productId,
      payload: {
        productId,
        changes,
      },
      timestamp: new Date(),
      version: 1,
    };

    await this.publish('products', event);
  }

  async publishProductDeleted(productId: string): Promise<void> {
    const event: ProductDeletedEvent = {
      id: uuidv4(),
      type: 'product.deleted',
      aggregateId: productId,
      payload: {
        productId,
      },
      timestamp: new Date(),
      version: 1,
    };

    await this.publish('products', event);
  }

  async publishInventoryUpdated(
    productId: string,
    previousQuantity: number,
    newQuantity: number,
    variantId?: string
  ): Promise<void> {
    const event: InventoryUpdatedEvent = {
      id: uuidv4(),
      type: 'inventory.updated',
      aggregateId: productId,
      payload: {
        productId,
        variantId,
        previousQuantity,
        newQuantity,
      },
      timestamp: new Date(),
      version: 1,
    };

    await this.publish('inventory', event);
  }

  async publishInventoryLowStock(
    productId: string,
    currentQuantity: number,
    threshold: number,
    variantId?: string
  ): Promise<void> {
    const event: InventoryLowStockEvent = {
      id: uuidv4(),
      type: 'inventory.low_stock',
      aggregateId: productId,
      payload: {
        productId,
        variantId,
        currentQuantity,
        threshold,
      },
      timestamp: new Date(),
      version: 1,
    };

    await this.publish('inventory', event);
  }

  private async publish(topic: string, event: any): Promise<void> {
    if (!this.connected) {
      logger.warn('Kafka producer not connected, buffering event', { topic, eventType: event.type });

      return;
    }

    try {
      await this.producer.send({
        topic,
        messages: [
          {
            key: event.aggregateId,
            value: JSON.stringify(event),
            headers: {
              'event-type': event.type,
              'event-id': event.id,
            },
          },
        ],
      });
      logger.info('Event published', { topic, eventType: event.type, eventId: event.id });
    } catch (error) {
      logger.error('Failed to publish event', { error, topic, eventType: event.type });
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.connected) {
      await this.producer.disconnect();
      this.connected = false;
      logger.info('Kafka producer disconnected');
    }
  }
}

export const eventPublisher = new EventPublisher();
