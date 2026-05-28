import express from 'express';
import { createLogger } from '@commercesphere/utils';
import { config } from './config';
import { initializeDatabase, pool } from './database';
import { cacheService } from './cache';
import { eventPublisher } from './events';
import { reservationExpiryJob } from './reservation-expiry-job';
import routes from './routes';

const logger = createLogger({ serviceName: 'product-service' });

const app = express();


app.use(express.json());
app.use(express.urlencoded({ extended: true }));


app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info('Request completed', {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration,
    });
  });
  next();
});


app.use('/', routes);


app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled error', { error: err });
  res.status(500).json({ error: 'Internal server error' });
});


async function shutdown() {
  logger.info('Shutting down gracefully...');
  
  try {
    reservationExpiryJob.stop();
    await eventPublisher.disconnect();
    await cacheService.close();
    await pool.end();
    logger.info('All connections closed');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown', { error });
    process.exit(1);
  }
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);


async function start() {
  try {

    await initializeDatabase();
    logger.info('Database initialized');


    await eventPublisher.connect();
    logger.info('Kafka connected');


    reservationExpiryJob.start();
    logger.info('Reservation expiry job started');


    app.listen(config.port, () => {
      logger.info(`Product Service listening on port ${config.port}`);
    });
  } catch (error) {
    logger.error('Failed to start service', { error });
    process.exit(1);
  }
}

start();
