import express from 'express';
import { createLogger } from '@commercesphere/utils';
import { config } from './config';
import { initDatabase } from './database';
import { analyticsEventConsumer } from './event-consumer';
import { analyticsService } from './analytics.service';
import routes from './routes';

const logger = createLogger({ serviceName: 'analytics-service' });

const app = express();


app.use(express.json());


app.use('/analytics', routes);


app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'analytics-service' });
});


let aggregationInterval: NodeJS.Timeout | null = null;

async function startServer(): Promise<void> {
  try {

    logger.info('Initializing database...');
    await initDatabase();


    logger.info('Starting event consumer...');
    await analyticsEventConsumer.start();


    logger.info('Starting hourly batch aggregation...');
    aggregationInterval = setInterval(
      async () => {
        try {
          await analyticsService.runHourlyAggregation();
        } catch (error) {
          logger.error('Hourly aggregation failed', {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      },
      60 * 60 * 1000 // Run every hour
    );


    app.listen(config.port, () => {
      logger.info(`Analytics Service started successfully`, {
        port: config.port,
        nodeEnv: config.nodeEnv,
      });
    });
  } catch (error) {
    logger.error('Failed to start Analytics Service', {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  }
}


async function shutdown(): Promise<void> {
  logger.info('Shutting down Analytics Service...');


  if (aggregationInterval) {
    clearInterval(aggregationInterval);
  }


  await analyticsEventConsumer.stop();

  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);


startServer();
