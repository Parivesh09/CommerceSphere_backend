import { Kafka, Producer, ProducerRecord, RecordMetadata, CompressionTypes } from 'kafkajs';
import { DomainEvent } from '@commercesphere/types';
import { logger } from './logger';
import { getCorrelationId } from './correlation';

interface KafkaProducerConfig {
  brokers: string[];
  clientId: string;
  maxRetries?: number;
  retryTime?: number;
}

interface BufferedEvent {
  topic: string;
  event: DomainEvent;
  timestamp: number;
}

export class KafkaEventProducer {
  private kafka: Kafka;
  private producer: Producer | null = null;
  private connected: boolean = false;
  private eventBuffer: BufferedEvent[] = [];
  private readonly maxBufferSize: number = 1000;
  private flushInterval: NodeJS.Timeout | null = null;

  constructor(private config: KafkaProducerConfig) {
    this.kafka = new Kafka({
      clientId: config.clientId,
      brokers: config.brokers,
      retry: {
        retries: config.maxRetries || 5,
        initialRetryTime: config.retryTime || 300,
        maxRetryTime: 30000,
      },
    });

    this.producer = this.kafka.producer({
      allowAutoTopicCreation: true,
      transactionTimeout: 30000,
    });


    this.startBufferFlush();
  }

  async connect(): Promise<void> {
    if (this.connected) {
      return;
    }

    try {
      await this.producer!.connect();
      this.connected = true;
      logger.info('Kafka producer connected', {
        clientId: this.config.clientId,
        brokers: this.config.brokers,
      });


      await this.flushBuffer();
    } catch (error) {
      logger.error('Failed to connect Kafka producer', {
        error: error instanceof Error ? error.message : String(error),
        clientId: this.config.clientId,
      });
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }

    if (this.producer && this.connected) {
      await this.producer.disconnect();
      this.connected = false;
      logger.info('Kafka producer disconnected', {
        clientId: this.config.clientId,
      });
    }
  }

  async publishEvent(topic: string, event: DomainEvent): Promise<RecordMetadata[] | null> {
    const correlationId = getCorrelationId();

    try {

      if (!this.connected) {
        this.bufferEvent(topic, event);
        logger.warn('Kafka producer not connected, event buffered', {
          topic,
          eventType: event.type,
          eventId: event.id,
          correlationId,
          bufferSize: this.eventBuffer.length,
        });
        return null;
      }

      const message = {
        key: event.aggregateId,
        value: JSON.stringify(event),
        headers: {
          correlationId: correlationId || '',
          eventType: event.type,
          eventId: event.id,
          timestamp: new Date().toISOString(),
        },
      };

      const result = await this.producer!.send({
        topic,
        messages: [message],
        compression: CompressionTypes.GZIP,
      });

      logger.info('Event published to Kafka', {
        topic,
        eventType: event.type,
        eventId: event.id,
        aggregateId: event.aggregateId,
        correlationId,
        partition: result[0].partition,
        offset: result[0].offset,
      });

      return result;
    } catch (error) {
      logger.error('Failed to publish event to Kafka', {
        topic,
        eventType: event.type,
        eventId: event.id,
        error: error instanceof Error ? error.message : String(error),
        correlationId,
      });


      this.bufferEvent(topic, event);
      throw error;
    }
  }

  async publishBatch(topic: string, events: DomainEvent[]): Promise<RecordMetadata[]> {
    const correlationId = getCorrelationId();

    try {
      if (!this.connected) {
        events.forEach(event => this.bufferEvent(topic, event));
        logger.warn('Kafka producer not connected, events buffered', {
          topic,
          eventCount: events.length,
          correlationId,
          bufferSize: this.eventBuffer.length,
        });
        return [];
      }

      const messages = events.map(event => ({
        key: event.aggregateId,
        value: JSON.stringify(event),
        headers: {
          correlationId: correlationId || '',
          eventType: event.type,
          eventId: event.id,
          timestamp: new Date().toISOString(),
        },
      }));

      const result = await this.producer!.send({
        topic,
        messages,
        compression: CompressionTypes.GZIP,
      });

      logger.info('Batch events published to Kafka', {
        topic,
        eventCount: events.length,
        correlationId,
      });

      return result;
    } catch (error) {
      logger.error('Failed to publish batch events to Kafka', {
        topic,
        eventCount: events.length,
        error: error instanceof Error ? error.message : String(error),
        correlationId,
      });


      events.forEach(event => this.bufferEvent(topic, event));
      throw error;
    }
  }

  private bufferEvent(topic: string, event: DomainEvent): void {

    if (this.eventBuffer.length >= this.maxBufferSize) {
      logger.error('Event buffer full, dropping oldest event', {
        maxBufferSize: this.maxBufferSize,
        topic,
        eventType: event.type,
      });
      this.eventBuffer.shift(); // Remove oldest event
    }

    this.eventBuffer.push({
      topic,
      event,
      timestamp: Date.now(),
    });
  }

  private async flushBuffer(): Promise<void> {
    if (this.eventBuffer.length === 0 || !this.connected) {
      return;
    }

    const eventsToFlush = [...this.eventBuffer];
    this.eventBuffer = [];

    logger.info('Flushing buffered events', {
      eventCount: eventsToFlush.length,
    });

    for (const bufferedEvent of eventsToFlush) {
      try {
        await this.publishEvent(bufferedEvent.topic, bufferedEvent.event);
      } catch (error) {
        logger.error('Failed to flush buffered event', {
          topic: bufferedEvent.topic,
          eventType: bufferedEvent.event.type,
          eventId: bufferedEvent.event.id,
          error: error instanceof Error ? error.message : String(error),
        });

      }
    }
  }

  private startBufferFlush(): void {

    this.flushInterval = setInterval(async () => {
      if (this.connected && this.eventBuffer.length > 0) {
        await this.flushBuffer();
      }
    }, 30000);
  }

  getBufferSize(): number {
    return this.eventBuffer.length;
  }

  isConnected(): boolean {
    return this.connected;
  }
}


let producerInstance: KafkaEventProducer | null = null;

export function createKafkaProducer(config: KafkaProducerConfig): KafkaEventProducer {
  if (!producerInstance) {
    producerInstance = new KafkaEventProducer(config);
  }
  return producerInstance;
}

export function getKafkaProducer(): KafkaEventProducer {
  if (!producerInstance) {
    throw new Error('Kafka producer not initialized. Call createKafkaProducer first.');
  }
  return producerInstance;
}
