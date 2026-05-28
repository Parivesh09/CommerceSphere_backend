import { productRepository } from './repository';
import { createLogger } from '@commercesphere/utils';

const logger = createLogger({ serviceName: 'product-service' });

export class ReservationExpiryJob {
  private intervalId: NodeJS.Timeout | null = null;
  private readonly intervalMs: number;

  constructor(intervalMinutes: number = 1) {
    this.intervalMs = intervalMinutes * 60 * 1000;
  }

  start(): void {
    if (this.intervalId) {
      logger.warn('Reservation expiry job is already running');
      return;
    }

    logger.info('Starting reservation expiry job', { intervalMinutes: this.intervalMs / 60000 });


    this.runExpiry();


    this.intervalId = setInterval(() => {
      this.runExpiry();
    }, this.intervalMs);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info('Reservation expiry job stopped');
    }
  }

  private async runExpiry(): Promise<void> {
    try {
      const expiredCount = await productRepository.expireOldReservations();
      
      if (expiredCount > 0) {
        logger.info('Expired reservations processed', { count: expiredCount });
      }
    } catch (error) {
      logger.error('Error running reservation expiry job', { error });
    }
  }
}

export const reservationExpiryJob = new ReservationExpiryJob();
