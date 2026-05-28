import { randomUUID } from 'crypto';
import { AsyncLocalStorage } from 'async_hooks';

export const CORRELATION_ID_HEADER = 'x-correlation-id';


const correlationIdStorage = new AsyncLocalStorage<string>();

export const generateCorrelationId = (): string => {
  return randomUUID();
};

export const getCorrelationId = (headers?: Record<string, any>): string => {

  const contextId = correlationIdStorage.getStore();
  if (contextId) {
    return contextId;
  }
  

  if (headers) {
    return headers[CORRELATION_ID_HEADER] || generateCorrelationId();
  }
  

  return generateCorrelationId();
};

export const setCorrelationId = (correlationId: string): void => {
  correlationIdStorage.enterWith(correlationId);
};

export const clearCorrelationId = (): void => {
  correlationIdStorage.enterWith('');
};

export const runWithCorrelationId = <T>(
  correlationId: string,
  fn: () => T
): T => {
  return correlationIdStorage.run(correlationId, fn);
};
