import express from 'express';
import { createLogger } from '@commercesphere/utils';
import { config } from './config';
import { initDatabase, pool } from './database';
import notificationRoutes from './routes';
import { startEventConsumer, stopEventConsumer } from './event-consumer';

const logger = createLogger({ serviceName: 'notification-service' });

const app = express();


app.use(express.json());
app.use(express.urlencoded({ extended: true }));


app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy', service: 'notification-service' });
});


app.get('/ready', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.status(200).json({ status: 'ready', service: 'notification-service' });
  } catch (error) {
    res.status(503).json({ status: 'not ready', service: 'notification-service' });
  }
});


app.use('/notifications', notificationRoutes);


app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  });

  res.status(err.status || 500).json({
    error: {
      code: err.code || 'INTERNAL_ERROR',
      message: err.message || 'Internal server error',
      timestamp: new Date().toISOString(),
      path: req.path,
    },
  });
});


const startServer = async () => {
  try {

    await initDatabase();
    logger.info('Database initialized');


    await startEventConsumer();
    logger.info('Event consumer started');


    app.listen(config.port, () => {
      logger.info(`Notification Service listening on port ${config.port}`);
    });
  } catch (error) {
    logger.error('Failed to start server', { error });
    process.exit(1);
  }
};


const shutdown = async (signal: string) => {
  logger.info(`${signal} received, shutting down gracefully`);
  
  try {
    await stopEventConsumer();
    await pool.end();
    logger.info('Shutdown complete');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown', { error });
    process.exit(1);
  }
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

startServer();
