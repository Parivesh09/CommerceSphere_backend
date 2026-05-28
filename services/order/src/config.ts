import { getEnv, getEnvNumber, getDatabaseConfig, getKafkaConfig } from '@commercesphere/utils';

export const config = {
  port: getEnvNumber('PORT', 3003),
  nodeEnv: getEnv('NODE_ENV', 'development'),
  database: getDatabaseConfig(),
  kafka: getKafkaConfig(),
};
