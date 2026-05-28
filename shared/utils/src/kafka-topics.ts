/**
 * Kafka Topics Configuration
 * 
 * Centralized definition of all Kafka topics used in the platform.
 * Each topic is configured with partitions and replication factor.
 */

export interface TopicConfig {
  name: string;
  partitions: number;
  replicationFactor: number;
  description: string;
}

export const KAFKA_TOPICS = {
  ORDERS: 'orders',
  PAYMENTS: 'payments',
  INVENTORY: 'inventory',
  ANALYTICS: 'analytics',
  NOTIFICATIONS: 'notifications',
} as const;

export const TOPIC_CONFIGS: Record<string, TopicConfig> = {
  [KAFKA_TOPICS.ORDERS]: {
    name: KAFKA_TOPICS.ORDERS,
    partitions: 3,
    replicationFactor: 1, // Set to 3 in production
    description: 'Order lifecycle events (created, paid, shipped, delivered, cancelled)',
  },
  [KAFKA_TOPICS.PAYMENTS]: {
    name: KAFKA_TOPICS.PAYMENTS,
    partitions: 3,
    replicationFactor: 1, // Set to 3 in production
    description: 'Payment events (success, failed, refund initiated, refund completed)',
  },
  [KAFKA_TOPICS.INVENTORY]: {
    name: KAFKA_TOPICS.INVENTORY,
    partitions: 3,
    replicationFactor: 1, // Set to 3 in production
    description: 'Inventory events (updated, low stock, reservation created, reservation released)',
  },
  [KAFKA_TOPICS.ANALYTICS]: {
    name: KAFKA_TOPICS.ANALYTICS,
    partitions: 3,
    replicationFactor: 1, // Set to 3 in production
    description: 'Analytics events (product viewed, order completed, user activity)',
  },
  [KAFKA_TOPICS.NOTIFICATIONS]: {
    name: KAFKA_TOPICS.NOTIFICATIONS,
    partitions: 3,
    replicationFactor: 1, // Set to 3 in production
    description: 'Notification events (email, SMS, push notifications)',
  },
};

export function getAllTopicNames(): string[] {
  return Object.values(KAFKA_TOPICS);
}

export function getTopicConfig(topicName: string): TopicConfig | undefined {
  return TOPIC_CONFIGS[topicName];
}
