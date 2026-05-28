import express from 'express';
import { createLogger, createKafkaProducer } from '@commercesphere/utils';
import { config } from './config';
import { initDatabase, pool } from './database';
import orderRoutes from './routes';
import { errorHandler, correlationIdMiddleware, requestLogger } from './middleware';
import { orderEventConsumer } from './event-consumer';

const logger = createLogger({ serviceName: 'order-service' });

const app = express();


app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(correlationIdMiddleware);
app.use(requestLogger);


app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy', service: 'order-service' });
});


app.get('/ready', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.status(200).json({ status: 'ready', service: 'order-service' });
  } catch (error) {
    res.status(503).json({ status: 'not ready', service: 'order-service' });
  }
});


app.use('/orders', orderRoutes);


app.use(errorHandler);


const startServer = async () => {
  try {

    await initDatabase();
    logger.info('Database initialized');


    const kafkaProducer = createKafkaProducer({
      brokers: config.kafka.brokers,
      clientId: config.kafka.clientId,
    });
    await kafkaProducer.connect();
    logger.info('Kafka producer connected');


    await orderEventConsumer.start();
    logger.info('Kafka event consumer started');


    app.listen(config.port, () => {
      logger.info(`Order Service listening on port ${config.port}`);
    });
  } catch (error) {
    logger.error('Failed to start server', { error });
    process.exit(1);
  }
};


process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  await orderEventConsumer.stop();
  await pool.end();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  await orderEventConsumer.stop();
  await pool.end();
  process.exit(0);
});

startServer();
