import { Request, Response, NextFunction } from 'express';
import { AppError, createLogger } from '@commercesphere/utils';
import { getCorrelationId, setCorrelationId } from '@commercesphere/utils';

const logger = createLogger({ serviceName: 'order-service' });



export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
) => {
  const correlationId = getCorrelationId();

  if (err instanceof AppError) {
    logger.error('Application error', {
      error: err.message,
      statusCode: err.statusCode,
      path: req.path,
      method: req.method,
      correlationId,
    });

    return res.status(err.statusCode).json({
      error: {
        code: err.constructor.name,
        message: err.message,
        timestamp: new Date().toISOString(),
        path: req.path,
        correlationId,
      },
    });
  }


  logger.error('Unexpected error', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    correlationId,
  });

  return res.status(500).json({
    error: {
      code: 'InternalServerError',
      message: 'An unexpected error occurred',
      timestamp: new Date().toISOString(),
      path: req.path,
      correlationId,
    },
  });
};


export const correlationIdMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const correlationId = req.headers['x-correlation-id'] as string || 
                        req.headers['correlation-id'] as string;
  
  if (correlationId) {
    setCorrelationId(correlationId);
  }

  res.setHeader('x-correlation-id', getCorrelationId());
  next();
};


export const requestLogger = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const start = Date.now();
  const correlationId = getCorrelationId();

  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info('Request completed', {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration,
      correlationId,
    });
  });

  next();
};
