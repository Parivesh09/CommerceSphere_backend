import { getEnv, getEnvNumber, getDatabaseConfig, getKafkaConfig } from '@commercesphere/utils';

export const config = {
  port: getEnvNumber('PORT', 3008),
  nodeEnv: getEnv('NODE_ENV', 'development'),
  database: getDatabaseConfig(),
  kafka: getKafkaConfig(),
};
