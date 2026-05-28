#!/usr/bin/env ts-node

/**
 * Kafka Topics Initialization Script
 * 
 * This script creates all required Kafka topics with proper partitioning
 * and replication configuration. Run this after starting Kafka.
 * 
 * Usage: npm run init:kafka
 */

import { createKafkaAdmin } from '../shared/utils/src/kafka-admin';
import { logger } from '../shared/utils/src/logger';

async function initializeKafkaTopics() {
  const brokers = process.env.KAFKA_BROKERS?.split(',') || ['localhost:9092'];
  const clientId = 'kafka-admin-init';

  logger.info('Initializing Kafka topics', { brokers });

  const admin = createKafkaAdmin({
    brokers,
    clientId,
  });

  try {
    await admin.connect();


    logger.info('Creating main topics...');
    await admin.createTopics();


    logger.info('Creating dead letter queues...');
    await admin.createDeadLetterQueues();


    const topics = await admin.listTopics();
    logger.info('All Kafka topics', { topics });

    logger.info('Kafka topics initialization completed successfully');
  } catch (error) {
    logger.error('Failed to initialize Kafka topics', {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  } finally {
    await admin.disconnect();
  }
}


if (require.main === module) {
  initializeKafkaTopics()
    .then(() => {
      logger.info('Script completed');
      process.exit(0);
    })
    .catch(error => {
      logger.error('Script failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      process.exit(1);
    });
}

export { initializeKafkaTopics };
