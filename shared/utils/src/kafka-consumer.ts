import {
  Kafka,
  Consumer,
  ConsumerSubscribeTopics,
  EachMessagePayload,
  KafkaMessage,
} from 'kafkajs';
import { DomainEvent } from '@commercesphere/types';
import { logger } from './logger';
import { setCorrelationId, clearCorrelationId } from './correlation';

interface KafkaConsumerConfig {
  brokers: string[];
  groupId: string;
  clientId: string;
  topics: string[];
  fromBeginning?: boolean;
}

export type EventHandler = (event: DomainEvent, message: KafkaMessage) => Promise<void>;

interface RetryConfig {
  maxRetries: number;
  retryDelays: number[]; // Delays in milliseconds for each retry attempt
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  retryDelays: [1000, 5000, 15000], // 1s, 5s, 15s
};

export class KafkaEventConsumer {
  private kafka: Kafka;
  private consumer: Consumer | null = null;
  private handlers: Map<string, EventHandler> = new Map();
  private connected: boolean = false;
  private retryConfig: RetryConfig;
  private deadLetterProducer: any = null;

  constructor(
    private config: KafkaConsumerConfig,
    retryConfig?: Partial<RetryConfig>
  ) {
    this.kafka = new Kafka({
      clientId: config.clientId,
      brokers: config.brokers,
      retry: {
        retries: 5,
        initialRetryTime: 300,
        maxRetryTime: 30000,
      },
    });

    this.consumer = this.kafka.consumer({
      groupId: config.groupId,
      sessionTimeout: 30000,
      heartbeatInterval: 3000,
      maxWaitTimeInMs: 5000,
      retry: {
        retries: 5,
      },
    });

    this.retryConfig = {
      ...DEFAULT_RETRY_CONFIG,
      ...retryConfig,
    };


    this.deadLetterProducer = this.kafka.producer({
      allowAutoTopicCreation: true,
    });
  }

  async connect(): Promise<void> {
    if (this.connected) {
      return;
    }

    try {
      await this.consumer!.connect();
      await this.deadLetterProducer.connect();
      this.connected = true;

      logger.info('Kafka consumer connected', {
        groupId: this.config.groupId,
        clientId: this.config.clientId,
        brokers: this.config.brokers,
      });


      const subscribeTopics: ConsumerSubscribeTopics = {
        topics: this.config.topics,
        fromBeginning: this.config.fromBeginning || false,
      };

      await this.consumer!.subscribe(subscribeTopics);

      logger.info('Subscribed to Kafka topics', {
        topics: this.config.topics,
        groupId: this.config.groupId,
      });


      await this.startConsuming();
    } catch (error) {
      logger.error('Failed to connect Kafka consumer', {
        error: error instanceof Error ? error.message : String(error),
        groupId: this.config.groupId,
      });
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.consumer && this.connected) {
      await this.consumer.disconnect();
      await this.deadLetterProducer.disconnect();
      this.connected = false;
      logger.info('Kafka consumer disconnected', {
        groupId: this.config.groupId,
      });
    }
  }

  registerHandler(eventType: string, handler: EventHandler): void {
    this.handlers.set(eventType, handler);
    logger.info('Event handler registered', {
      eventType,
      groupId: this.config.groupId,
    });
  }

  private async startConsuming(): Promise<void> {
    await this.consumer!.run({
      eachMessage: async (payload: EachMessagePayload) => {
        await this.handleMessage(payload);
      },
    });
  }

  private async handleMessage(payload: EachMessagePayload): Promise<void> {
    const { topic, partition, message } = payload;
    const correlationId = message.headers?.correlationId?.toString() || '';


    setCorrelationId(correlationId);

    try {
      if (!message.value) {
        logger.warn('Received message with no value', {
          topic,
          partition,
          offset: message.offset,
        });
        return;
      }

      const event: DomainEvent = JSON.parse(message.value.toString());

      logger.info('Processing Kafka message', {
        topic,
        partition,
        offset: message.offset,
        eventType: event.type,
        eventId: event.id,
        aggregateId: event.aggregateId,
        correlationId,
      });


      const handler = this.handlers.get(event.type);

      if (!handler) {
        logger.warn('No handler registered for event type', {
          eventType: event.type,
          topic,
          availableHandlers: Array.from(this.handlers.keys()),
        });
        return;
      }


      await this.processWithRetry(event, message, handler, topic);

      logger.info('Successfully processed Kafka message', {
        topic,
        partition,
        offset: message.offset,
        eventType: event.type,
        eventId: event.id,
        correlationId,
      });
    } catch (error) {
      logger.error('Fatal error processing Kafka message', {
        topic,
        partition,
        offset: message.offset,
        error: error instanceof Error ? error.message : String(error),
        correlationId,
      });

    } finally {
      clearCorrelationId();
    }
  }

  private async processWithRetry(
    event: DomainEvent,
    message: KafkaMessage,
    handler: EventHandler,
    topic: string
  ): Promise<void> {
    const retryCount = this.getRetryCount(message);

    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        await handler(event, message);
        return; // Success
      } catch (error) {
        const isLastAttempt = attempt === this.retryConfig.maxRetries;

        logger.error('Error processing event', {
          eventType: event.type,
          eventId: event.id,
          attempt: attempt + 1,
          maxRetries: this.retryConfig.maxRetries + 1,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });

        if (isLastAttempt) {

          await this.moveToDeadLetterQueue(topic, event, message, error);
          throw error;
        }


        const delay = this.retryConfig.retryDelays[attempt] || 15000;
        logger.info('Retrying event processing', {
          eventType: event.type,
          eventId: event.id,
          nextAttempt: attempt + 2,
          delayMs: delay,
        });

        await this.sleep(delay);
      }
    }
  }

  private async moveToDeadLetterQueue(
    originalTopic: string,
    event: DomainEvent,
    message: KafkaMessage,
    error: unknown
  ): Promise<void> {
    const dlqTopic = `${originalTopic}.dlq`;

    try {
      const dlqMessage = {
        key: message.key?.toString() || event.aggregateId,
        value: JSON.stringify({
          originalTopic,
          event,
          error: error instanceof Error ? error.message : String(error),
          errorStack: error instanceof Error ? error.stack : undefined,
          originalMessage: {
            offset: message.offset,
            timestamp: message.timestamp,
          },
          movedToDlqAt: new Date().toISOString(),
        }),
        headers: {
          ...message.headers,
          dlqReason: 'max_retries_exceeded',
          originalTopic,
        },
      };

      await this.deadLetterProducer.send({
        topic: dlqTopic,
        messages: [dlqMessage],
      });

      logger.error('Event moved to dead letter queue', {
        originalTopic,
        dlqTopic,
        eventType: event.type,
        eventId: event.id,
        error: error instanceof Error ? error.message : String(error),
      });
    } catch (dlqError) {
      logger.error('Failed to move event to dead letter queue', {
        originalTopic,
        dlqTopic,
        eventType: event.type,
        eventId: event.id,
        error: dlqError instanceof Error ? dlqError.message : String(dlqError),
      });
    }
  }

  private getRetryCount(message: KafkaMessage): number {
    const retryHeader = message.headers?.retryCount?.toString();
    return retryHeader ? parseInt(retryHeader, 10) : 0;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  isConnected(): boolean {
    return this.connected;
  }

  getRegisteredHandlers(): string[] {
    return Array.from(this.handlers.keys());
  }
}

export function createKafkaConsumer(
  config: KafkaConsumerConfig,
  retryConfig?: Partial<RetryConfig>
): KafkaEventConsumer {
  return new KafkaEventConsumer(config, retryConfig);
}
