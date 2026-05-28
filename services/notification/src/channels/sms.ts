import twilio from 'twilio';
import { config } from '../config';
import { createLogger, CircuitBreaker, CircuitBreakerOpenError } from '@commercesphere/utils';

const logger = createLogger({ serviceName: 'notification-service' });


let twilioClient: ReturnType<typeof twilio> | null = null;

if (config.twilio.accountSid && config.twilio.authToken) {
  twilioClient = twilio(config.twilio.accountSid, config.twilio.authToken);
}

export interface SmsOptions {
  to: string;
  body: string;
}


const smsCircuitBreaker = new CircuitBreaker(
  async (options: SmsOptions): Promise<void> => {
    if (!twilioClient || !config.twilio.phoneNumber) {
      logger.warn('Twilio not configured, skipping SMS send', {
        to: options.to,
      });
      return;
    }

    const message = await twilioClient.messages.create({
      body: options.body,
      from: config.twilio.phoneNumber,
      to: options.to,
    });

    logger.info('SMS sent successfully', {
      to: options.to,
      messageSid: message.sid,
    });
  },
  {
    name: 'twilio-sms',
    failureThreshold: 5,
    failureTimeWindowMs: 10000,
    resetTimeoutMs: 60000,
    halfOpenMaxAttempts: 3,
    onStateChange: (state) => {
      logger.warn('Twilio circuit breaker state changed', { state });
    },
  }
);

export async function sendSms(options: SmsOptions): Promise<void> {
  try {
    await smsCircuitBreaker.execute(options);
  } catch (error) {
    if (error instanceof CircuitBreakerOpenError) {
      logger.error('Twilio circuit breaker is open', {
        to: options.to,
        error: error.message,
      });

      throw new Error('SMS service temporarily unavailable');
    }
    
    logger.error('Failed to send SMS', {
      to: options.to,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
