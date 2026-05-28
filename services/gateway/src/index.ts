import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import https from 'https';
import fs from 'fs';
import { config } from './config';
import { connectRedis, disconnectRedis } from './redis-client';
import {
  correlationIdMiddleware,
  rateLimiterMiddleware,
  requestLoggerMiddleware,
} from './middleware';
import { router } from './routes';
import { createLogger } from '@commercesphere/utils';

const logger = createLogger({ serviceName: 'api-gateway' });

const app = express();

/**
 * Security middleware
 */
app.use(helmet());
app.use(cors());

/**
 * Parse JSON bodies
 */
app.use(express.json());

/**
 * Apply global middleware
 */
app.use(correlationIdMiddleware);
app.use(requestLoggerMiddleware);
app.use(rateLimiterMiddleware);

/**
 * Mount routes
 */
app.use('/', router);

/**
 * Global error handler
 */
app.use((err: Error, req: any, res: any, next: any) => {
  logger.error('Unhandled error', {
    correlationId: req.correlationId,
    error: err.message,
    stack: err.stack,
    path: req.path,
  });

  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
      timestamp: new Date().toISOString(),
      path: req.path,
      correlationId: req.correlationId,
    },
  });
});

/**
 * Start server
 */
async function startServer(): Promise<void> {
  try {

    await connectRedis();


    if (config.ssl.enabled && config.ssl.certPath && config.ssl.keyPath) {
      const httpsOptions = {
        cert: fs.readFileSync(config.ssl.certPath),
        key: fs.readFileSync(config.ssl.keyPath),
      };

      https.createServer(httpsOptions, app).listen(config.port, () => {
        logger.info(`API Gateway (HTTPS) listening on port ${config.port}`);
      });
    } else {
      app.listen(config.port, () => {
        logger.info(`API Gateway (HTTP) listening on port ${config.port}`);
      });
    }
  } catch (error) {
    logger.error('Failed to start API Gateway', { error });
    process.exit(1);
  }
}

/**
 * Graceful shutdown
 */
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  await disconnectRedis();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  await disconnectRedis();
  process.exit(0);
});


startServer();
