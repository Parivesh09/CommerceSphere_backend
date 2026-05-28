import Redis from 'ioredis';
import { config } from './config';
import { createLogger } from '@commercesphere/utils';
import { Product } from './types';

const logger = createLogger({ serviceName: 'product-service' });

export class CacheService {
  private redis: Redis;

  constructor() {
    this.redis = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
    });

    this.redis.on('error', (err) => {
      logger.error('Redis connection error', { error: err });
    });

    this.redis.on('connect', () => {
      logger.info('Redis connected successfully');
    });
  }

  async getProduct(productId: string): Promise<Product | null> {
    try {
      const cached = await this.redis.get(`product:${productId}`);
      if (cached) {
        logger.debug('Cache hit for product', { productId });
        return JSON.parse(cached);
      }
      logger.debug('Cache miss for product', { productId });
      return null;
    } catch (error) {
      logger.error('Error getting product from cache', { error, productId });
      return null;
    }
  }

  async setProduct(product: Product): Promise<void> {
    try {
      await this.redis.setex(
        `product:${product.id}`,
        config.cache.productTTL,
        JSON.stringify(product)
      );
      logger.debug('Product cached', { productId: product.id });
    } catch (error) {
      logger.error('Error setting product in cache', { error, productId: product.id });
    }
  }

  async invalidateProduct(productId: string): Promise<void> {
    try {
      await this.redis.del(`product:${productId}`);
      logger.debug('Product cache invalidated', { productId });
    } catch (error) {
      logger.error('Error invalidating product cache', { error, productId });
    }
  }

  async getProductList(cacheKey: string): Promise<any | null> {
    try {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        logger.debug('Cache hit for product list', { cacheKey });
        return JSON.parse(cached);
      }
      logger.debug('Cache miss for product list', { cacheKey });
      return null;
    } catch (error) {
      logger.error('Error getting product list from cache', { error, cacheKey });
      return null;
    }
  }

  async setProductList(cacheKey: string, data: any): Promise<void> {
    try {
      await this.redis.setex(
        cacheKey,
        config.cache.listTTL,
        JSON.stringify(data)
      );
      logger.debug('Product list cached', { cacheKey });
    } catch (error) {
      logger.error('Error setting product list in cache', { error, cacheKey });
    }
  }

  async invalidateProductLists(): Promise<void> {
    try {
      const keys = await this.redis.keys('products:page:*');
      if (keys.length > 0) {
        await this.redis.del(...keys);
        logger.debug('Product list caches invalidated', { count: keys.length });
      }
    } catch (error) {
      logger.error('Error invalidating product list caches', { error });
    }
  }

  async close(): Promise<void> {
    await this.redis.quit();
  }
}

export const cacheService = new CacheService();
