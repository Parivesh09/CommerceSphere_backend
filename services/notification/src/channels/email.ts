import sgMail from '@sendgrid/mail';
import { config } from '../config';
import { createLogger, CircuitBreaker, CircuitBreakerOpenError } from '@commercesphere/utils';

const logger = createLogger({ serviceName: 'notification-service' });


if (config.sendgrid.apiKey) {
  sgMail.setApiKey(config.sendgrid.apiKey);
}

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
}


const emailCircuitBreaker = new CircuitBreaker(
  async (options: EmailOptions): Promise<void> => {
    if (!config.sendgrid.apiKey) {
      logger.warn('SendGrid API key not configured, skipping email send', {
        to: options.to,
        subject: options.subject,
      });
      return;
    }

    const msg = {
      to: options.to,
      from: {
        email: config.sendgrid.fromEmail,
        name: config.sendgrid.fromName,
      },
      subject: options.subject,
      html: options.html,
    };

    await sgMail.send(msg);

    logger.info('Email sent successfully', {
      to: options.to,
      subject: options.subject,
    });
  },
  {
    name: 'sendgrid-email',
    failureThreshold: 5,
    failureTimeWindowMs: 10000,
    resetTimeoutMs: 60000,
    halfOpenMaxAttempts: 3,
    onStateChange: (state) => {
      logger.warn('SendGrid circuit breaker state changed', { state });
    },
  }
);

export async function sendEmail(options: EmailOptions): Promise<void> {
  try {
    await emailCircuitBreaker.execute(options);
  } catch (error) {
    if (error instanceof CircuitBreakerOpenError) {
      logger.error('SendGrid circuit breaker is open', {
        to: options.to,
        subject: options.subject,
        error: error.message,
      });

      throw new Error('Email service temporarily unavailable');
    }
    
    logger.error('Failed to send email', {
      to: options.to,
      subject: options.subject,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
