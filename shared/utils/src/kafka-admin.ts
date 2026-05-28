import { Kafka, Admin, ITopicConfig } from 'kafkajs';
import { logger } from './logger';
import { TOPIC_CONFIGS, TopicConfig } from './kafka-topics';

interface KafkaAdminConfig {
  brokers: string[];
  clientId: string;
}

export class KafkaAdminClient {
  private kafka: Kafka;
  private admin: Admin | null = null;

  constructor(private config: KafkaAdminConfig) {
    this.kafka = new Kafka({
      clientId: config.clientId,
      brokers: config.brokers,
      retry: {
        retries: 5,
        initialRetryTime: 300,
        maxRetryTime: 30000,
      },
    });

    this.admin = this.kafka.admin();
  }

  async connect(): Promise<void> {
    try {
      await this.admin!.connect();
      logger.info('Kafka admin client connected', {
        clientId: this.config.clientId,
        brokers: this.config.brokers,
      });
    } catch (error) {
      logger.error('Failed to connect Kafka admin client', {
        error: error instanceof Error ? error.message : String(error),
        clientId: this.config.clientId,
      });
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.admin) {
      await this.admin.disconnect();
      logger.info('Kafka admin client disconnected');
    }
  }

  async createTopics(topicConfigs?: TopicConfig[]): Promise<void> {
    const configs = topicConfigs || Object.values(TOPIC_CONFIGS);

    try {
      const topics: ITopicConfig[] = configs.map(config => ({
        topic: config.name,
        numPartitions: config.partitions,
        replicationFactor: config.replicationFactor,
        configEntries: [
          { name: 'retention.ms', value: '604800000' }, // 7 days
          { name: 'cleanup.policy', value: 'delete' },
          { name: 'compression.type', value: 'gzip' },
        ],
      }));

      const created = await this.admin!.createTopics({
        topics,
        waitForLeaders: true,
        timeout: 30000,
      });

      if (created) {
        logger.info('Kafka topics created successfully', {
          topics: configs.map(c => c.name),
        });
      } else {
        logger.info('Kafka topics already exist', {
          topics: configs.map(c => c.name),
        });
      }
    } catch (error) {
      logger.error('Failed to create Kafka topics', {
        error: error instanceof Error ? error.message : String(error),
        topics: configs.map(c => c.name),
      });
      throw error;
    }
  }

  async listTopics(): Promise<string[]> {
    try {
      const topics = await this.admin!.listTopics();
      logger.info('Listed Kafka topics', {
        count: topics.length,
        topics,
      });
      return topics;
    } catch (error) {
      logger.error('Failed to list Kafka topics', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async deleteTopic(topicName: string): Promise<void> {
    try {
      await this.admin!.deleteTopics({
        topics: [topicName],
        timeout: 30000,
      });
      logger.info('Kafka topic deleted', { topic: topicName });
    } catch (error) {
      logger.error('Failed to delete Kafka topic', {
        topic: topicName,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async getTopicMetadata(topicName: string): Promise<any> {
    try {
      const metadata = await this.admin!.fetchTopicMetadata({
        topics: [topicName],
      });
      logger.info('Fetched topic metadata', {
        topic: topicName,
        partitions: metadata.topics[0]?.partitions.length,
      });
      return metadata;
    } catch (error) {
      logger.error('Failed to fetch topic metadata', {
        topic: topicName,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async createDeadLetterQueues(): Promise<void> {
    const mainTopics = Object.values(TOPIC_CONFIGS);
    const dlqTopics: TopicConfig[] = mainTopics.map(topic => ({
      name: `${topic.name}.dlq`,
      partitions: 1, // DLQ typically needs fewer partitions
      replicationFactor: topic.replicationFactor,
      description: `Dead letter queue for ${topic.name}`,
    }));

    await this.createTopics(dlqTopics);
    logger.info('Dead letter queues created', {
      topics: dlqTopics.map(t => t.name),
    });
  }
}

export function createKafkaAdmin(config: KafkaAdminConfig): KafkaAdminClient {
  return new KafkaAdminClient(config);
}
