import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { AuthenticatedRequest } from '../types';

/**
 * Middleware to generate or extract correlation ID for request tracing
 */
export function correlationIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const correlationId = (req.headers['x-correlation-id'] as string) || uuidv4();
  
  (req as AuthenticatedRequest).correlationId = correlationId;
  res.setHeader('X-Correlation-ID', correlationId);
  
  next();
}
