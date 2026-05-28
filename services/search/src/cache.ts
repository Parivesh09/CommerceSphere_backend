import Redis from 'ioredis';
import { createLogger } from '@commercesphere/utils';
import { config } from './config';
import { SearchResponse } from './types';

const logger = createLogger({ serviceName: 'search-service' });

export const redisClient = new Redis({
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password,
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
});

redisClient.on('connect', () => {
  logger.info('Redis connected');
});

redisClient.on('error', (error) => {
  logger.error('Redis error', { error });
});

export async function getCachedSearchResults(
  cacheKey: string
): Promise<SearchResponse | null> {
  try {
    const cached = await redisClient.get(cacheKey);
    if (cached) {
      logger.debug('Cache hit', { cacheKey });
      return JSON.parse(cached);
    }
    logger.debug('Cache miss', { cacheKey });
    return null;
  } catch (error) {
    logger.error('Error getting cached search results', { error, cacheKey });
    return null;
  }
}

export async function setCachedSearchResults(
  cacheKey: string,
  results: SearchResponse
): Promise<void> {
  try {
    await redisClient.setex(
      cacheKey,
      config.cache.searchResultsTTL,
      JSON.stringify(results)
    );
    logger.debug('Cache set', { cacheKey, ttl: config.cache.searchResultsTTL });
  } catch (error) {
    logger.error('Error setting cached search results', { error, cacheKey });
  }
}

export function generateCacheKey(params: Record<string, unknown>): string {

  const sortedKeys = Object.keys(params).sort();
  const keyParts = sortedKeys.map((key) => `${key}:${params[key]}`);
  return `search:${keyParts.join(':')}`;
}
