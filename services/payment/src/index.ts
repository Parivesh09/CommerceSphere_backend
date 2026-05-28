import express, { Request, Response, NextFunction } from 'express';
import { config } from './config';
import { initializeDatabase, closeDatabase } from './database';
import { PaymentService } from './payment.service';
import { PaymentEventPublisher } from './event-publisher';
import { PaymentEventConsumer } from './event-consumer';
import { createPaymentRoutes } from './routes';
import { logger, setCorrelationId } from '@commercesphere/utils';
import { v4 as uuidv4 } from 'uuid';
import { ErrorResponse, StripeWebhookRequest } from './types';

const app = express();


app.use('/payments/webhook', express.raw({ type: 'application/json' }), (req: StripeWebhookRequest, res, next) => {
  req.rawBody = req.body;
  next();
});


app.use(express.json());


app.use((req: Request, res: Response, next: NextFunction) => {
  const correlationId = (req.headers['x-correlation-id'] as string) || uuidv4();
  setCorrelationId(correlationId);
  res.setHeader('x-correlation-id', correlationId);
  next();
});


app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info('Request completed', {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration,
    });
  });
  
  next();
});


app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'healthy', service: 'payment-service' });
});


app.get('/ready', (req: Request, res: Response) => {
  res.json({ status: 'ready', service: 'payment-service' });
});


let paymentService: PaymentService;
let eventPublisher: PaymentEventPublisher;
let eventConsumer: PaymentEventConsumer;

async function initializeServices() {

  await initializeDatabase();
  

  eventPublisher = new PaymentEventPublisher();
  await eventPublisher.connect();
  

  paymentService = new PaymentService(eventPublisher);
  

  eventConsumer = new PaymentEventConsumer(paymentService);
  await eventConsumer.start();
  
  logger.info('All services initialized');
}


initializeServices().then(() => {
  app.use('/payments', createPaymentRoutes(paymentService, eventPublisher));
  

  app.use((req: Request, res: Response) => {
    res.status(404).json({
      error: {
        code: 'NOT_FOUND',
        message: `Route not found: ${req.method} ${req.path}`,
        timestamp: new Date().toISOString(),
        path: req.path,
      },
    } as ErrorResponse);
  });
  

  app.use((err: Error, req: Request, res: Response) => {
    logger.error('Unhandled error', {
      error: err.message,
      stack: err.stack,
      path: req.path,
      method: req.method,
    });
    
    res.status(500).json({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: config.nodeEnv === 'production' 
          ? 'An internal error occurred' 
          : err.message,
        timestamp: new Date().toISOString(),
        path: req.path,
      },
    } as ErrorResponse);
  });
  

  const server = app.listen(config.port, () => {
    logger.info('Payment service started', {
      port: config.port,
      nodeEnv: config.nodeEnv,
    });
  });
  

  const shutdown = async () => {
    logger.info('Shutting down payment service...');
    
    server.close(async () => {
      try {
        await eventConsumer.stop();
        await eventPublisher.disconnect();
        await closeDatabase();
        logger.info('Payment service shut down successfully');
        process.exit(0);
      } catch (error) {
        logger.error('Error during shutdown', {
          error: error instanceof Error ? error.message : String(error),
        });
        process.exit(1);
      }
    });
    

    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  };
  
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}).catch((error) => {
  logger.error('Failed to initialize services', {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});

export default app;
