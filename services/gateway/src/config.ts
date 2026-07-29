import { getEnv, getEnvNumber } from '@commercesphere/utils';

export const config = {
  port: getEnvNumber('PORT', 3000),
  jwtSecret: getEnv('JWT_SECRET', 'dev-secret-change-in-production'),
  redis: {
    host: getEnv('REDIS_HOST', 'localhost'),
    port: getEnvNumber('REDIS_PORT', 6379),
    password: getEnv('REDIS_PASSWORD', ''),
  },
  rateLimit: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 100, // 100 requests per minute per user
  },
  services: {
    auth: getEnv('AUTH_SERVICE_URL', 'http://localhost:3001'),
    product: getEnv('PRODUCT_SERVICE_URL', 'http://localhost:3002'),
    order: getEnv('ORDER_SERVICE_URL', 'http://localhost:3003'),
    payment: getEnv('PAYMENT_SERVICE_URL', 'http://localhost:3004'),
    notification: getEnv('NOTIFICATION_SERVICE_URL', 'http://localhost:3005'),
    search: getEnv('SEARCH_SERVICE_URL', 'http://localhost:3006'),
    recommendation: getEnv('RECOMMENDATION_SERVICE_URL', 'http://localhost:3007'),
    analytics: getEnv('ANALYTICS_SERVICE_URL', 'http://localhost:3008'),
    cart: getEnv('CART_SERVICE_URL', 'http://localhost:3009'),
  },
  ssl: {
    enabled: getEnv('SSL_ENABLED', 'false') === 'true',
    certPath: getEnv('SSL_CERT_PATH', ''),
    keyPath: getEnv('SSL_KEY_PATH', ''),
  },
};
