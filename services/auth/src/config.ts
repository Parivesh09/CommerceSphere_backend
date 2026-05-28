import { getEnv, getEnvNumber } from '@commercesphere/utils';

export const config = {
  port: getEnvNumber('PORT', 3001),
  jwtSecret: getEnv('JWT_SECRET', 'dev-secret-change-in-production'),
  jwtAccessExpiry: getEnv('JWT_ACCESS_EXPIRY', '1h'),
  jwtRefreshExpiry: getEnv('JWT_REFRESH_EXPIRY', '7d'),
  bcryptRounds: getEnvNumber('BCRYPT_ROUNDS', 12),
  database: {
    host: getEnv('DB_HOST', 'localhost'),
    port: getEnvNumber('DB_PORT', 5432),
    database: getEnv('DB_NAME', 'auth_db'),
    user: getEnv('DB_USER', 'postgres'),
    password: getEnv('DB_PASSWORD', 'postgres'),
  },
  redis: {
    host: getEnv('REDIS_HOST', 'localhost'),
    port: getEnvNumber('REDIS_PORT', 6379),
    password: getEnv('REDIS_PASSWORD', ''),
  },
};
