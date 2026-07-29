import express from 'express';
import { createLogger } from '@commercesphere/utils';
import { config } from './config';
import { initDatabase, pool } from './database';
import cartRoutes from './routes';
import { errorHandler, correlationIdMiddleware, requestLogger } from './middleware';

const logger = createLogger({ serviceName: 'cart-service' });

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(correlationIdMiddleware);
app.use(requestLogger);

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy', service: 'cart-service' });
});

app.get('/ready', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.status(200).json({ status: 'ready', service: 'cart-service' });
  } catch (error) {
    res.status(503).json({ status: 'not ready', service: 'cart-service' });
  }
});

app.use('/cart', cartRoutes);

app.use(errorHandler);

const startServer = async () => {
  try {
    await initDatabase();
    logger.info('Database initialized');

    app.listen(config.port, () => {
      logger.info(`Cart Service listening on port ${config.port}`);
    });
  } catch (error) {
    logger.error('Failed to start server', { error });
    process.exit(1);
  }
};

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  await pool.end();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  await pool.end();
  process.exit(0);
});

startServer();
