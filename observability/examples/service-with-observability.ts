/**
 * Example: Service with Full Observability Integration
 * 
 * This example demonstrates how to integrate all observability features
 * into a microservice: logging, metrics, tracing, and health checks.
 */

import express from 'express';
import {
  createLogger,
  initializeMetrics,
  initializeTracer,
  correlationMiddleware,
  requestLoggingMiddleware,
  metricsMiddleware,
  errorLoggingMiddleware,
  healthCheckHandler,
  readinessCheckHandler,
  metricsEndpointHandler,
  getMetrics,
  getTracer,
} from '@commercesphere/utils';

const app = express();
const serviceName = 'example-service';
const port = 3000;





const logger = createLogger({
  serviceName,
  level: process.env.LOG_LEVEL || 'info',
  enableConsole: true,
  enableFile: process.env.NODE_ENV === 'production',
});

const metrics = initializeMetrics({
  serviceName,
  enableDefaultMetrics: true,
});

const tracer = initializeTracer(serviceName);





const ordersProcessed = metrics.createCounter(
  'orders_processed_total',
  'Total number of orders processed',
  ['status']
);

const orderProcessingDuration = metrics.createHistogram(
  'order_processing_duration_seconds',
  'Duration of order processing',
  ['order_type'],
  [0.1, 0.5, 1, 2, 5, 10]
);

const activeOrders = metrics.createGauge(
  'active_orders',
  'Number of orders currently being processed'
);





app.use(express.json());


app.use(correlationMiddleware());


app.use(requestLoggingMiddleware(logger));


app.use(metricsMiddleware());





app.post('/api/orders', async (req, res) => {

  const span = tracer.startSpan('create-order');
  span.setTag('order.type', req.body.type || 'standard');
  

  activeOrders.inc();
  

  const timer = orderProcessingDuration.startTimer();
  
  try {
    logger.info('Creating order', {
      orderType: req.body.type,
      userId: req.body.userId,
    });
    
    span.log({ event: 'order-validation-started' });
    

    await processOrder(req.body);
    
    span.log({ event: 'order-created' });
    

    ordersProcessed.inc({ status: 'success' });
    timer({ order_type: req.body.type || 'standard' });
    

    metrics.recordBusinessEvent('order.created', 'success');
    
    logger.info('Order created successfully', {
      orderId: 'order-123',
    });
    
    res.status(201).json({
      orderId: 'order-123',
      status: 'created',
    });
    
  } catch (error) {
    span.setTag('error', true);
    span.log({
      event: 'error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
    

    ordersProcessed.inc({ status: 'error' });
    metrics.recordError('OrderCreationError', 'create-order');
    metrics.recordBusinessEvent('order.created', 'failure');
    
    logger.error('Failed to create order', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
    
    res.status(500).json({
      error: 'Failed to create order',
    });
    
  } finally {
    span.finish();
    activeOrders.dec();
  }
});

app.get('/api/orders/:id', async (req, res) => {
  const span = tracer.startSpan('get-order');
  span.setTag('order.id', req.params.id);
  
  try {
    logger.info('Fetching order', { orderId: req.params.id });
    

    const order = await getOrder(req.params.id);
    
    span.log({ event: 'order-fetched' });
    
    res.json(order);
    
  } catch (error) {
    span.setTag('error', true);
    span.log({
      event: 'error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
    
    metrics.recordError('OrderFetchError', 'get-order');
    
    logger.error('Failed to fetch order', {
      orderId: req.params.id,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    
    res.status(404).json({
      error: 'Order not found',
    });
    
  } finally {
    span.finish();
  }
});






app.get('/health', healthCheckHandler());


app.get('/ready', readinessCheckHandler([

  async () => {

    try {

      return true;
    } catch {
      return false;
    }
  },
  async () => {

    try {

      return true;
    } catch {
      return false;
    }
  },
]));


app.get('/metrics', metricsEndpointHandler());





app.use(errorLoggingMiddleware(logger));

app.use((err: Error, req: any, res: any, next: any) => {
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
      correlationId: req.correlationId,
    },
  });
});





app.listen(port, () => {
  logger.info('Service started', {
    port,
    environment: process.env.NODE_ENV || 'development',
  });
});





process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});





async function processOrder(orderData: any): Promise<void> {

  await new Promise(resolve => setTimeout(resolve, 100));
}

async function getOrder(orderId: string): Promise<any> {

  await new Promise(resolve => setTimeout(resolve, 50));
  return {
    id: orderId,
    status: 'completed',
    total: 99.99,
  };
}
