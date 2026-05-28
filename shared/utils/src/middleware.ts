import { Request, Response, NextFunction } from 'express';
import { getCorrelationId, setCorrelationId, CORRELATION_ID_HEADER } from './correlation';
import { getMetrics } from './metrics';
import { Logger } from './logger';


export const correlationMiddleware = () => {
  return (req: Request, res: Response, next: NextFunction) => {
    const correlationId = getCorrelationId(req.headers);
    setCorrelationId(correlationId);
    

    res.setHeader(CORRELATION_ID_HEADER, correlationId);
    

    (req as any).correlationId = correlationId;
    
    next();
  };
};


export const requestLoggingMiddleware = (logger: Logger) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();
    const correlationId = (req as any).correlationId || getCorrelationId();


    logger.info('Incoming request', {
      correlationId,
      method: req.method,
      path: req.path,
      query: req.query,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });


    const originalSend = res.send;
    res.send = function (data: any) {
      const duration = Date.now() - startTime;
      
      logger.info('Request completed', {
        correlationId,
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        duration: `${duration}ms`,
      });

      return originalSend.call(this, data);
    };

    next();
  };
};


export const metricsMiddleware = () => {
  return (req: Request, res: Response, next: NextFunction) => {
    const metrics = getMetrics();
    const startTime = process.hrtime();
    

    const route = req.route?.path || req.path;
    const normalizedRoute = route.replace(/\/[0-9a-f-]{36}/gi, '/:id');
    
    metrics.startHttpRequest(req.method, normalizedRoute);


    const originalSend = res.send;
    res.send = function (data: any) {
      const [seconds, nanoseconds] = process.hrtime(startTime);
      const duration = seconds + nanoseconds / 1e9;
      
      metrics.recordHttpRequest(req.method, normalizedRoute, res.statusCode, duration);
      metrics.endHttpRequest(req.method, normalizedRoute);

      return originalSend.call(this, data);
    };

    next();
  };
};


export const errorLoggingMiddleware = (logger: Logger) => {
  return (err: Error, req: Request, res: Response, next: NextFunction) => {
    const correlationId = (req as any).correlationId || getCorrelationId();
    
    logger.error('Request error', {
      correlationId,
      method: req.method,
      path: req.path,
      error: err.message,
      stack: err.stack,
    });


    try {
      const metrics = getMetrics();
      metrics.recordError(err.name || 'UnknownError', req.path);
    } catch (e) {

    }

    next(err);
  };
};


export const healthCheckHandler = () => {
  return (req: Request, res: Response) => {
    res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  };
};


export const readinessCheckHandler = (checks: Array<() => Promise<boolean>>) => {
  return async (req: Request, res: Response) => {
    try {
      const results = await Promise.all(checks.map(check => check()));
      const isReady = results.every(result => result === true);
      
      if (isReady) {
        res.status(200).json({
          status: 'ready',
          timestamp: new Date().toISOString(),
        });
      } else {
        res.status(503).json({
          status: 'not ready',
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      res.status(503).json({
        status: 'not ready',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      });
    }
  };
};


export const metricsEndpointHandler = () => {
  return async (req: Request, res: Response) => {
    try {
      const metrics = getMetrics();
      const metricsData = await metrics.getMetrics();
      
      res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
      res.send(metricsData);
    } catch (error) {
      res.status(500).json({
        error: 'Failed to collect metrics',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };
};
