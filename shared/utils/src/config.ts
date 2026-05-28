export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
}

export interface KafkaConfig {
  brokers: string[];
  clientId: string;
}

export const getEnv = (key: string, defaultValue?: string): string => {
  const value = process.env[key];
  if (value === undefined && defaultValue === undefined) {
    throw new Error(`Environment variable ${key} is required`);
  }
  return value !== undefined ? value : defaultValue!;
};

export const getEnvNumber = (key: string, defaultValue?: number): number => {
  const value = process.env[key];
  if (!value && defaultValue === undefined) {
    throw new Error(`Environment variable ${key} is required`);
  }
  return value ? parseInt(value, 10) : defaultValue!;
};

export const getDatabaseConfig = (): DatabaseConfig => ({
  host: getEnv('DB_HOST', 'localhost'),
  port: getEnvNumber('DB_PORT', 5432),
  database: getEnv('DB_NAME'),
  user: getEnv('DB_USER'),
  password: getEnv('DB_PASSWORD'),
});

export const getRedisConfig = (): RedisConfig => ({
  host: getEnv('REDIS_HOST', 'localhost'),
  port: getEnvNumber('REDIS_PORT', 6379),
  password: getEnv('REDIS_PASSWORD', ''),
});

export const getKafkaConfig = (): KafkaConfig => ({
  brokers: getEnv('KAFKA_BROKERS', 'localhost:9092').split(','),
  clientId: getEnv('KAFKA_CLIENT_ID'),
});
