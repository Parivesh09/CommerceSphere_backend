import express from 'express';
import { createLogger } from '@commercesphere/utils';
import { config } from './config';
import { initializeElasticsearch } from './elasticsearch-client';
import { redisClient } from './cache';
import routes from './routes';
import { startEventConsumer } from './event-consumer';

const logger = createLogger({ serviceName: 'search-service' });

const app = express();


app.use(express.json());


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



app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Unhandled error', { error: err, path: req.path });
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
      timestamp: new Date().toISOString(),
      path: req.path,
    },
  });
});

async function start() {
  try {
    logger.info('Search Service starting...');


    await initializeElasticsearch();


    await startEventConsumer();


    app.listen(config.port, () => {
      logger.info(`Search Service listening on port ${config.port}`);
    });
  } catch (error) {
    logger.error('Failed to start Search Service', { error });
    process.exit(1);
  }
}


process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  await redisClient.quit();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  await redisClient.quit();
  process.exit(0);
});

start();
