import { createLogger } from './logger';

const logger = createLogger({ serviceName: 'circuit-breaker' });

export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

export interface CircuitBreakerOptions {
  name: string;
  failureThreshold: number;
  failureTimeWindowMs: number;
  resetTimeoutMs: number;
  halfOpenMaxAttempts: number;
  onStateChange?: (state: CircuitState) => void;
}

interface FailureRecord {
  timestamp: number;
}

export class CircuitBreaker<T extends any[], R> {
  private state: CircuitState = CircuitState.CLOSED;
  private failures: FailureRecord[] = [];
  private lastFailureTime: number = 0;
  private halfOpenAttempts: number = 0;
  private successCount: number = 0;
  private readonly options: CircuitBreakerOptions;

  constructor(
    private readonly operation: (...args: T) => Promise<R>,
    options: Partial<CircuitBreakerOptions> = {}
  ) {
    this.options = {
      name: options.name || 'unnamed-circuit',
      failureThreshold: options.failureThreshold || 5,
      failureTimeWindowMs: options.failureTimeWindowMs || 10000,
      resetTimeoutMs: options.resetTimeoutMs || 60000,
      halfOpenMaxAttempts: options.halfOpenMaxAttempts || 3,
      onStateChange: options.onStateChange,
    };

    logger.info('Circuit breaker initialized', {
      name: this.options.name,
      failureThreshold: this.options.failureThreshold,
      failureTimeWindowMs: this.options.failureTimeWindowMs,
      resetTimeoutMs: this.options.resetTimeoutMs,
    });
  }

  async execute(...args: T): Promise<R> {
    if (this.state === CircuitState.OPEN) {
      return this.handleOpenCircuit();
    }

    if (this.state === CircuitState.HALF_OPEN) {
      return this.handleHalfOpenCircuit(args);
    }


    return this.executeOperation(args);
  }

  private async handleOpenCircuit(): Promise<R> {
    const timeSinceLastFailure = Date.now() - this.lastFailureTime;

    if (timeSinceLastFailure >= this.options.resetTimeoutMs) {
      logger.info('Circuit breaker transitioning to HALF_OPEN', {
        name: this.options.name,
        timeSinceLastFailure,
      });
      this.transitionTo(CircuitState.HALF_OPEN);
      this.halfOpenAttempts = 0;
      this.successCount = 0;
      

      const error = new CircuitBreakerOpenError(
        `Circuit breaker transitioned to HALF_OPEN for ${this.options.name}. Retry the request.`
      );
      throw error;
    }

    const error = new CircuitBreakerOpenError(
      `Circuit breaker is OPEN for ${this.options.name}. Retry after ${
        this.options.resetTimeoutMs - timeSinceLastFailure
      }ms`
    );
    logger.warn('Circuit breaker rejected request', {
      name: this.options.name,
      state: this.state,
      timeSinceLastFailure,
    });
    throw error;
  }

  private async handleHalfOpenCircuit(args: T): Promise<R> {
    if (this.halfOpenAttempts >= this.options.halfOpenMaxAttempts) {
      const error = new CircuitBreakerOpenError(
        `Circuit breaker is HALF_OPEN and max test attempts reached for ${this.options.name}`
      );
      logger.warn('Circuit breaker rejected request in HALF_OPEN', {
        name: this.options.name,
        halfOpenAttempts: this.halfOpenAttempts,
      });
      throw error;
    }

    this.halfOpenAttempts++;
    return this.executeOperation(args);
  }

  private async executeOperation(args: T): Promise<R> {
    try {
      const result = await this.operation(...args);
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error);
      throw error;
    }
  }

  private onSuccess(): void {
    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;
      logger.info('Circuit breaker test request succeeded', {
        name: this.options.name,
        successCount: this.successCount,
        halfOpenAttempts: this.halfOpenAttempts,
      });


      if (this.successCount >= this.options.halfOpenMaxAttempts) {
        logger.info('Circuit breaker closing after successful tests', {
          name: this.options.name,
          successCount: this.successCount,
        });
        this.transitionTo(CircuitState.CLOSED);
        this.failures = [];
        this.halfOpenAttempts = 0;
        this.successCount = 0;
      }
    }
  }

  private onFailure(error: unknown): void {
    const now = Date.now();
    this.lastFailureTime = now;


    this.failures.push({ timestamp: now });


    this.failures = this.failures.filter(
      (f) => now - f.timestamp < this.options.failureTimeWindowMs
    );

    logger.error('Circuit breaker operation failed', {
      name: this.options.name,
      state: this.state,
      failureCount: this.failures.length,
      error: error instanceof Error ? error.message : String(error),
    });


    if (this.state === CircuitState.CLOSED) {
      if (this.failures.length >= this.options.failureThreshold) {
        logger.error('Circuit breaker opening due to repeated failures', {
          name: this.options.name,
          failureCount: this.failures.length,
          threshold: this.options.failureThreshold,
        });
        this.transitionTo(CircuitState.OPEN);
      }
    } else if (this.state === CircuitState.HALF_OPEN) {

      logger.error('Circuit breaker reopening after test failure', {
        name: this.options.name,
        halfOpenAttempts: this.halfOpenAttempts,
      });
      this.transitionTo(CircuitState.OPEN);
      this.halfOpenAttempts = 0;
      this.successCount = 0;
    }
  }

  private transitionTo(newState: CircuitState): void {
    const oldState = this.state;
    this.state = newState;

    logger.info('Circuit breaker state changed', {
      name: this.options.name,
      oldState,
      newState,
    });

    if (this.options.onStateChange) {
      try {
        this.options.onStateChange(newState);
      } catch (error) {
        logger.error('Error in circuit breaker state change callback', {
          name: this.options.name,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  getState(): CircuitState {
    return this.state;
  }

  getStats() {
    return {
      name: this.options.name,
      state: this.state,
      failureCount: this.failures.length,
      lastFailureTime: this.lastFailureTime,
      halfOpenAttempts: this.halfOpenAttempts,
      successCount: this.successCount,
    };
  }

  reset(): void {
    logger.info('Circuit breaker manually reset', {
      name: this.options.name,
    });
    this.transitionTo(CircuitState.CLOSED);
    this.failures = [];
    this.halfOpenAttempts = 0;
    this.successCount = 0;
    this.lastFailureTime = 0;
  }
}

export class CircuitBreakerOpenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CircuitBreakerOpenError';
    Object.setPrototypeOf(this, CircuitBreakerOpenError.prototype);
  }
}
