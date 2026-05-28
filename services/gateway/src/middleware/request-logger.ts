import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types';
import { createLogger } from '@commercesphere/utils';

const logger = createLogger({ serviceName: 'api-gateway' });

/**
 * Middleware to log all requests with correlation IDs
 */
export function requestLoggerMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const startTime = Date.now();


  logger.info('Incoming request', {
    correlationId: req.correlationId,
    method: req.method,
    path: req.path,
    query: req.query,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    userId: req.user?.sub,
  });


  const originalSend = res.send;
  res.send = function (data: any): Response {
    const duration = Date.now() - startTime;

    logger.info('Request completed', {
      correlationId: req.correlationId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration,
      userId: req.user?.sub,
    });

    return originalSend.call(this, data);
  };

  next();
}
