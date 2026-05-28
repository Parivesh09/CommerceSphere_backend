import { getEnv } from '@commercesphere/utils';

export const config = {
  port: parseInt(getEnv('PORT', '3002'), 10),
  database: {
    host: getEnv('DB_HOST', 'localhost'),
    port: parseInt(getEnv('DB_PORT', '5432'), 10),
    database: getEnv('DB_NAME', 'product_service'),
    user: getEnv('DB_USER', 'commercesphere'),
    password: getEnv('DB_PASSWORD', 'commercesphere_dev'),
  },
  redis: {
    host: getEnv('REDIS_HOST', 'localhost'),
    port: parseInt(getEnv('REDIS_PORT', '6379'), 10),
  },
  kafka: {
    brokers: getEnv('KAFKA_BROKERS', 'localhost:9092').split(','),
    clientId: 'product-service',
  },
  cache: {
    productTTL: 3600, // 1 hour in seconds
    listTTL: 300, // 5 minutes in seconds
  },
  s3: {
    region: getEnv('AWS_REGION', 'us-east-1'),
    bucket: getEnv('S3_BUCKET', 'commercesphere-products'),
    endpoint: getEnv('S3_ENDPOINT'), // Optional: for MinIO or other S3-compatible services
    accessKeyId: getEnv('AWS_ACCESS_KEY_ID'),
    secretAccessKey: getEnv('AWS_SECRET_ACCESS_KEY'),
    presignedUrlExpiration: parseInt(getEnv('S3_PRESIGNED_URL_EXPIRATION', '900'), 10), // 15 minutes
  },
  cdn: {
    baseUrl: getEnv('CDN_BASE_URL', ''), // e.g., https://cdn.commercesphere.com
  },
  inventory: {
    lowStockThreshold: parseInt(getEnv('LOW_STOCK_THRESHOLD', '10'), 10),
  },
};
