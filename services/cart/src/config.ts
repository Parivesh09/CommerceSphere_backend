import { getEnv, getEnvNumber, getDatabaseConfig } from '@commercesphere/utils';

export const config = {
  port: getEnvNumber('PORT', 3009),
  nodeEnv: getEnv('NODE_ENV', 'development'),
  database: getDatabaseConfig(),
};
