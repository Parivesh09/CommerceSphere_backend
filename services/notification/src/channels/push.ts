import admin from 'firebase-admin';
import { config } from '../config';
import { createLogger, CircuitBreaker, CircuitBreakerOpenError } from '@commercesphere/utils';

const logger = createLogger({ serviceName: 'notification-service' });


let firebaseInitialized = false;

if (config.firebase.projectId && config.firebase.privateKey && config.firebase.clientEmail) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: config.firebase.projectId,
        privateKey: config.firebase.privateKey,
        clientEmail: config.firebase.clientEmail,
      }),
    });
    firebaseInitialized = true;
    logger.info('Firebase Admin initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize Firebase Admin', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export interface PushOptions {
  token: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}


const pushCircuitBreaker = new CircuitBreaker(
  async (options: PushOptions): Promise<void> => {
    if (!firebaseInitialized) {
      logger.warn('Firebase not configured, skipping push notification', {
        title: options.title,
      });
      return;
    }

    const message = {
      notification: {
        title: options.title,
        body: options.body,
      },
      data: options.data || {},
      token: options.token,
    };

    const response = await admin.messaging().send(message);

    logger.info('Push notification sent successfully', {
      title: options.title,
      messageId: response,
    });
  },
  {
    name: 'firebase-push',
    failureThreshold: 5,
    failureTimeWindowMs: 10000,
    resetTimeoutMs: 60000,
    halfOpenMaxAttempts: 3,
    onStateChange: (state) => {
      logger.warn('Firebase push circuit breaker state changed', { state });
    },
  }
);

export async function sendPushNotification(options: PushOptions): Promise<void> {
  try {
    await pushCircuitBreaker.execute(options);
  } catch (error) {
    if (error instanceof CircuitBreakerOpenError) {
      logger.error('Firebase push circuit breaker is open', {
        title: options.title,
        error: error.message,
      });

      throw new Error('Push notification service temporarily unavailable');
    }
    
    logger.error('Failed to send push notification', {
      title: options.title,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
