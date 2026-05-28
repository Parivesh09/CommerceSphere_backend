import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { AuthenticatedRequest } from '../types';
import { createLogger } from '@commercesphere/utils';

const logger = createLogger({ serviceName: 'api-gateway' });

/**
 * Middleware to validate JWT tokens
 */
export function jwtValidationMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Missing or invalid authorization header',
        timestamp: new Date().toISOString(),
        path: req.path,
        correlationId: req.correlationId,
      },
    });
    return;
  }

  const token = authHeader.substring(7); // Remove 'Bearer ' prefix

  try {
    const decoded = jwt.verify(token, config.jwtSecret) as {
      sub: string;
      email: string;
      role: string;
      iat: number;
      exp: number;
    };

    req.user = decoded;
    
    logger.debug('JWT validated successfully', {
      correlationId: req.correlationId,
      userId: decoded.sub,
      path: req.path,
    });

    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      res.status(401).json({
        error: {
          code: 'TOKEN_EXPIRED',
          message: 'JWT token has expired',
          timestamp: new Date().toISOString(),
          path: req.path,
          correlationId: req.correlationId,
        },
      });
      return;
    }

    if (error instanceof jwt.JsonWebTokenError) {
      res.status(401).json({
        error: {
          code: 'INVALID_TOKEN',
          message: 'Invalid JWT token',
          timestamp: new Date().toISOString(),
          path: req.path,
          correlationId: req.correlationId,
        },
      });
      return;
    }

    logger.error('JWT validation error', {
      correlationId: req.correlationId,
      error: error instanceof Error ? error.message : 'Unknown error',
      path: req.path,
    });

    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Error validating token',
        timestamp: new Date().toISOString(),
        path: req.path,
        correlationId: req.correlationId,
      },
    });
  }
}

/**
 * Optional JWT validation - doesn't fail if token is missing
 */
export function optionalJwtValidationMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    next();
    return;
  }

  const token = authHeader.substring(7);

  try {
    const decoded = jwt.verify(token, config.jwtSecret) as {
      sub: string;
      email: string;
      role: string;
      iat: number;
      exp: number;
    };

    req.user = decoded;
  } catch (error) {

    logger.debug('Optional JWT validation failed', {
      correlationId: req.correlationId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }

  next();
}
