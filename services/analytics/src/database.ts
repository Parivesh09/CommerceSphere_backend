import { Pool } from 'pg';
import { config } from './config';
import { createLogger } from '@commercesphere/utils';

const logger = createLogger({ serviceName: 'analytics-service' });

export const pool = new Pool({
  host: config.database.host,
  port: config.database.port,
  database: config.database.database,
  user: config.database.user,
  password: config.database.password,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err: Error) => {
  logger.error('Unexpected database error', { error: err });
});

export const initDatabase = async (): Promise<void> => {
  const client = await pool.connect();
  try {

    await client.query(`CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;`);
    

    await client.query(`
      CREATE TABLE IF NOT EXISTS order_metrics (
        timestamp TIMESTAMP NOT NULL,
        total_orders INTEGER DEFAULT 0,
        total_revenue DECIMAL(12, 2) DEFAULT 0,
        average_order_value DECIMAL(10, 2) DEFAULT 0,
        PRIMARY KEY (timestamp)
      );

      CREATE TABLE IF NOT EXISTS product_metrics (
        timestamp TIMESTAMP NOT NULL,
        product_id UUID NOT NULL,
        views INTEGER DEFAULT 0,
        purchases INTEGER DEFAULT 0,
        revenue DECIMAL(10, 2) DEFAULT 0,
        PRIMARY KEY (timestamp, product_id)
      );

      CREATE TABLE IF NOT EXISTS user_metrics (
        user_id UUID PRIMARY KEY,
        total_orders INTEGER DEFAULT 0,
        total_spent DECIMAL(12, 2) DEFAULT 0,
        lifetime_value DECIMAL(12, 2) DEFAULT 0,
        last_order_at TIMESTAMP,
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);


    try {
      await client.query(`SELECT create_hypertable('order_metrics', 'timestamp', if_not_exists => TRUE);`);
      await client.query(`SELECT create_hypertable('product_metrics', 'timestamp', if_not_exists => TRUE);`);
    } catch (error) {

      logger.warn('Hypertable creation skipped (may already exist)', { error });
    }


    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_order_metrics_timestamp ON order_metrics(timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_product_metrics_timestamp ON product_metrics(timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_product_metrics_product_id ON product_metrics(product_id);
      CREATE INDEX IF NOT EXISTS idx_user_metrics_total_spent ON user_metrics(total_spent DESC);
      CREATE INDEX IF NOT EXISTS idx_user_metrics_total_orders ON user_metrics(total_orders DESC);
      CREATE INDEX IF NOT EXISTS idx_user_metrics_lifetime_value ON user_metrics(lifetime_value DESC);
    `);

    logger.info('Database schema initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize database schema', { error });
    throw error;
  } finally {
    client.release();
  }
};
