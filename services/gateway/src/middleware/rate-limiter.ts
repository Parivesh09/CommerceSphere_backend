import { Response, NextFunction } from 'express';
import { redisClient } from '../redis-client';
import { config } from '../config';
import { AuthenticatedRequest } from '../types';
import { createLogger } from '@commercesphere/utils';

const logger = createLogger({ serviceName: 'api-gateway' });

/**
 * Rate limiter middleware using sliding window algorithm with Redis
 * Limits requests to 100 per minute per user
 */
export async function rateLimiterMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {

    const identifier = req.user?.sub || req.ip || 'anonymous';
    const key = `rate_limit:${identifier}`;
    
    const now = Date.now();
    const windowStart = now - config.rateLimit.windowMs;


    await redisClient.zRemRangeByScore(key, 0, windowStart);


    const requestCount = await redisClient.zCard(key);

    if (requestCount >= config.rateLimit.maxRequests) {

      const oldestRequests = await redisClient.zRangeWithScores(key, 0, 0);
      
      const resetTime = oldestRequests.length > 0 
        ? Math.ceil((oldestRequests[0].score + config.rateLimit.windowMs) / 1000)
        : Math.ceil((now + config.rateLimit.windowMs) / 1000);

      res.status(429).json({
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests. Please try again later.',
          timestamp: new Date().toISOString(),
          path: req.path,
          correlationId: req.correlationId,
          details: {
            limit: config.rateLimit.maxRequests,
            windowMs: config.rateLimit.windowMs,
            resetTime,
          },
        },
      });

      logger.warn('Rate limit exceeded', {
        correlationId: req.correlationId,
        identifier,
        requestCount,
        path: req.path,
      });

      return;
    }


    await redisClient.zAdd(key, {
      score: now,
      value: `${now}-${Math.random()}`, // Unique value for each request
    });


    await redisClient.expire(key, Math.ceil(config.rateLimit.windowMs / 1000) + 1);


    res.setHeader('X-RateLimit-Limit', config.rateLimit.maxRequests);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, config.rateLimit.maxRequests - requestCount - 1));
    res.setHeader('X-RateLimit-Reset', Math.ceil((now + config.rateLimit.windowMs) / 1000));

    next();
  } catch (error) {
    logger.error('Rate limiter error', {
      correlationId: req.correlationId,
      error: error instanceof Error ? error.message : 'Unknown error',
      path: req.path,
    });


    next();
  }
}
