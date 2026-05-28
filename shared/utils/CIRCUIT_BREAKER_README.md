# Circuit Breaker Pattern Implementation

This document describes the circuit breaker pattern implementation for the CommerceSphere microservices platform.

## Overview

The circuit breaker pattern prevents cascading failures by detecting when a downstream service is failing repeatedly and temporarily blocking requests to that service. This gives the failing service time to recover while providing fallback responses to clients.

## Circuit States

The circuit breaker has three states:

1. **CLOSED** (Normal Operation)
   - All requests pass through to the downstream service
   - Failures are tracked within a time window
   - If failures exceed the threshold, the circuit opens

2. **OPEN** (Failure Mode)
   - All requests are immediately rejected without calling the downstream service
   - After a reset timeout period, the circuit transitions to HALF_OPEN
   - Fallback responses are returned to clients

3. **HALF_OPEN** (Testing Recovery)
   - A limited number of test requests are allowed through
   - If test requests succeed, the circuit closes
   - If any test request fails, the circuit reopens

## Configuration

Default configuration values:
- **Failure Threshold**: 5 failures
- **Failure Time Window**: 10 seconds
- **Reset Timeout**: 60 seconds (time before transitioning to HALF_OPEN)
- **Half-Open Max Attempts**: 3 test requests

## Usage

### Basic Usage

```typescript
import { CircuitBreaker } from '@commercesphere/utils';


const myCircuitBreaker = new CircuitBreaker(
  async (arg1: string, arg2: number) => {

    return await someExternalService.call(arg1, arg2);
  },
  {
    name: 'my-service-operation',
    failureThreshold: 5,
    failureTimeWindowMs: 10000,
    resetTimeoutMs: 60000,
    halfOpenMaxAttempts: 3,
    onStateChange: (state) => {
      console.log(`Circuit breaker state changed to: ${state}`);
    },
  }
);


try {
  const result = await myCircuitBreaker.execute('test', 123);
  console.log('Success:', result);
} catch (error) {
  if (error instanceof CircuitBreakerOpenError) {
    console.log('Circuit is open, using fallback');

  } else {
    console.error('Operation failed:', error);
  }
}
```

### Monitoring Circuit State

```typescript

const state = myCircuitBreaker.getState();
console.log('Current state:', state); // CLOSED, OPEN, or HALF_OPEN


const stats = myCircuitBreaker.getStats();
console.log('Circuit breaker stats:', stats);








```

### Manual Reset

```typescript

myCircuitBreaker.reset();
```

## Implementation Examples

### Product Service - S3 Operations

The Product Service uses circuit breakers for S3 operations:

```typescript

this.uploadUrlCircuitBreaker = new CircuitBreaker(
  this.generateUploadUrlInternal.bind(this),
  {
    name: 's3-upload-url-generation',
    failureThreshold: 5,
    failureTimeWindowMs: 10000,
    resetTimeoutMs: 60000,
    halfOpenMaxAttempts: 3,
    onStateChange: (state) => {
      logger.warn('S3 upload URL circuit breaker state changed', { state });
    },
  }
);


async generateUploadUrl(productId: string, fileExtension: string) {
  try {
    return await this.uploadUrlCircuitBreaker.execute(productId, fileExtension);
  } catch (error) {
    if (error instanceof CircuitBreakerOpenError) {
      throw new Error('Image upload service is temporarily unavailable. Please try again later.');
    }
    throw error;
  }
}
```

### Payment Service - Stripe Operations

The Payment Service uses circuit breakers for Stripe API calls:

```typescript

this.paymentIntentCircuitBreaker = new CircuitBreaker(
  this.processStripePaymentInternal.bind(this),
  {
    name: 'stripe-payment-intent',
    failureThreshold: 5,
    failureTimeWindowMs: 10000,
    resetTimeoutMs: 60000,
    halfOpenMaxAttempts: 3,
    onStateChange: (state) => {
      logger.warn('Stripe payment intent circuit breaker state changed', { state });
    },
  }
);


async processStripePayment(payment: PaymentRecord, paymentMethodId: string) {
  try {
    return await this.paymentIntentCircuitBreaker.execute(payment, paymentMethodId);
  } catch (error) {
    if (error instanceof CircuitBreakerOpenError) {

      const failedPayment = await this.updatePaymentStatus(
        payment.id,
        'FAILED',
        undefined,
        { error: 'Payment service temporarily unavailable' }
      );
      await this.eventPublisher.publishPaymentFailed(
        failedPayment,
        'Payment service temporarily unavailable'
      );
      return failedPayment;
    }
    throw error;
  }
}
```

### Notification Service - SendGrid/Twilio

The Notification Service uses circuit breakers for email and SMS delivery:

```typescript

const emailCircuitBreaker = new CircuitBreaker(
  async (options: EmailOptions) => {
    await sgMail.send({
      to: options.to,
      from: { email: config.sendgrid.fromEmail, name: config.sendgrid.fromName },
      subject: options.subject,
      html: options.html,
    });
  },
  {
    name: 'sendgrid-email',
    failureThreshold: 5,
    failureTimeWindowMs: 10000,
    resetTimeoutMs: 60000,
    halfOpenMaxAttempts: 3,
  }
);


export async function sendEmail(options: EmailOptions) {
  try {
    await emailCircuitBreaker.execute(options);
  } catch (error) {
    if (error instanceof CircuitBreakerOpenError) {

      throw new Error('Email service temporarily unavailable');
    }
    throw error;
  }
}
```

## Best Practices

1. **Choose Appropriate Thresholds**
   - Set failure thresholds based on your service's normal error rate
   - Consider the impact of false positives (opening too early)

2. **Implement Fallback Responses**
   - Always provide meaningful fallback responses when the circuit is open
   - Consider caching previous successful responses for fallback

3. **Monitor Circuit State Changes**
   - Use the `onStateChange` callback to trigger alerts
   - Log circuit state changes for debugging and analysis

4. **Set Appropriate Timeouts**
   - Reset timeout should give the downstream service enough time to recover
   - Consider the impact on user experience

5. **Test Circuit Breaker Behavior**
   - Test that circuits open after repeated failures
   - Test that circuits transition to HALF_OPEN after timeout
   - Test that circuits close after successful test requests

## Monitoring and Alerting

Circuit breaker state changes are automatically logged with the following information:
- Circuit breaker name
- Old state and new state
- Failure count and timestamps
- Error details

Recommended alerts:
- Alert when a circuit opens (indicates downstream service issues)
- Alert if a circuit remains open for extended periods
- Alert on high failure rates even if circuit hasn't opened

## Testing

Example test for circuit breaker behavior:

```typescript
import { CircuitBreaker, CircuitState, CircuitBreakerOpenError } from '@commercesphere/utils';

describe('Circuit Breaker', () => {
  it('should open after threshold failures', async () => {
    let callCount = 0;
    const failingOperation = async () => {
      callCount++;
      throw new Error('Service unavailable');
    };

    const breaker = new CircuitBreaker(failingOperation, {
      name: 'test-breaker',
      failureThreshold: 3,
      failureTimeWindowMs: 10000,
    });


    for (let i = 0; i < 3; i++) {
      try {
        await breaker.execute();
      } catch (error) {

      }
    }

    expect(breaker.getState()).toBe(CircuitState.OPEN);


    await expect(breaker.execute()).rejects.toThrow(CircuitBreakerOpenError);
    expect(callCount).toBe(3); // Should not have called the operation again
  });
});
```

## Troubleshooting

### Circuit Opens Too Frequently
- Increase the failure threshold
- Increase the failure time window
- Check if the downstream service has capacity issues

### Circuit Doesn't Open When Expected
- Verify failures are occurring within the time window
- Check that errors are being thrown (not caught and suppressed)
- Review failure threshold configuration

### Circuit Stays Open Too Long
- Reduce the reset timeout
- Check if the downstream service has recovered
- Consider manual reset if needed

## Related Patterns

- **Retry Pattern**: Combine with circuit breaker for transient failures
- **Timeout Pattern**: Set operation timeouts to prevent hanging
- **Bulkhead Pattern**: Isolate resources to prevent cascading failures
