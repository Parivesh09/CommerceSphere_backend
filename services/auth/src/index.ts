import 'dotenv/config';
import express from 'express';
import { 
  createLogger, 
  corsMiddleware, 
  securityHeadersMiddleware,
  rateLimitMiddleware,
  correlationMiddleware,
  requestLoggingMiddleware,
  errorLoggingMiddleware,
  getSecurityConfig
} from '@commercesphere/utils';
import { config } from './config';
import { initDatabase, pool } from './database';
import authRoutes from './routes';
import { errorHandler } from './middleware';

const logger = createLogger({ serviceName: 'auth-service' });
const securityConfig = getSecurityConfig();

const app = express();


if (securityConfig.headers.enabled) {
  app.use(securityHeadersMiddleware());
}

if (securityConfig.cors.enabled) {
  app.use(corsMiddleware({
    allowedOrigins: securityConfig.cors.allowedOrigins,
    allowedMethods: securityConfig.cors.allowedMethods,
    allowedHeaders: securityConfig.cors.allowedHeaders,
    credentials: securityConfig.cors.credentials,
  }));
}


app.use(express.json({ limit: securityConfig.validation.maxBodySize }));
app.use(express.urlencoded({ extended: true, limit: securityConfig.validation.maxBodySize }));


app.use(correlationMiddleware());
app.use(requestLoggingMiddleware(logger));


if (securityConfig.rateLimit.enabled) {
  app.use(rateLimitMiddleware({
    windowMs: securityConfig.rateLimit.windowMs,
    maxRequests: securityConfig.rateLimit.maxRequests,
  }));
}


app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy', service: 'auth-service' });
});


app.use('/auth', authRoutes);


app.use(errorLoggingMiddleware(logger));


app.use(errorHandler);


const startServer = async () => {
  try {

    await initDatabase();
    logger.info('Database initialized');


    app.listen(config.port, () => {
      logger.info(`Auth Service listening on port ${config.port}`);
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

