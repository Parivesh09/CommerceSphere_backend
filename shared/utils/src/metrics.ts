import { Registry, Counter, Histogram, Gauge, collectDefaultMetrics } from 'prom-client';

export interface MetricsConfig {
  serviceName: string;
  enableDefaultMetrics?: boolean;
}

export class MetricsCollector {
  private registry: Registry;
  private serviceName: string;


  public httpRequestsTotal: Counter;
  public httpRequestDuration: Histogram;
  public httpRequestsInFlight: Gauge;


  public errorsTotal: Counter;


  public businessEventsTotal: Counter;

  constructor(config: MetricsConfig) {
    const { serviceName, enableDefaultMetrics = true } = config;
    
    this.serviceName = serviceName;
    this.registry = new Registry();
    this.registry.setDefaultLabels({ service: serviceName });


    if (enableDefaultMetrics) {
      collectDefaultMetrics({
        register: this.registry,
        prefix: `${serviceName}_`,
        gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2, 5],
      });
    }


    this.httpRequestsTotal = new Counter({
      name: `${serviceName}_http_requests_total`,
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'route', 'status_code'],
      registers: [this.registry],
    });


    this.httpRequestDuration = new Histogram({
      name: `${serviceName}_http_request_duration_seconds`,
      help: 'Duration of HTTP requests in seconds',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10],
      registers: [this.registry],
    });


    this.httpRequestsInFlight = new Gauge({
      name: `${serviceName}_http_requests_in_flight`,
      help: 'Number of HTTP requests currently being processed',
      labelNames: ['method', 'route'],
      registers: [this.registry],
    });


    this.errorsTotal = new Counter({
      name: `${serviceName}_errors_total`,
      help: 'Total number of errors',
      labelNames: ['type', 'operation'],
      registers: [this.registry],
    });


    this.businessEventsTotal = new Counter({
      name: `${serviceName}_business_events_total`,
      help: 'Total number of business events',
      labelNames: ['event_type', 'status'],
      registers: [this.registry],
    });
  }


  recordHttpRequest(method: string, route: string, statusCode: number, durationSeconds: number) {
    this.httpRequestsTotal.inc({ method, route, status_code: statusCode });
    this.httpRequestDuration.observe({ method, route, status_code: statusCode }, durationSeconds);
  }


  startHttpRequest(method: string, route: string) {
    this.httpRequestsInFlight.inc({ method, route });
  }

  endHttpRequest(method: string, route: string) {
    this.httpRequestsInFlight.dec({ method, route });
  }


  recordError(type: string, operation: string) {
    this.errorsTotal.inc({ type, operation });
  }


  recordBusinessEvent(eventType: string, status: 'success' | 'failure') {
    this.businessEventsTotal.inc({ event_type: eventType, status });
  }


  createCounter(name: string, help: string, labelNames: string[] = []) {
    return new Counter({
      name: `${this.serviceName}_${name}`,
      help,
      labelNames,
      registers: [this.registry],
    });
  }


  createHistogram(name: string, help: string, labelNames: string[] = [], buckets?: number[]) {
    return new Histogram({
      name: `${this.serviceName}_${name}`,
      help,
      labelNames,
      buckets,
      registers: [this.registry],
    });
  }


  createGauge(name: string, help: string, labelNames: string[] = []) {
    return new Gauge({
      name: `${this.serviceName}_${name}`,
      help,
      labelNames,
      registers: [this.registry],
    });
  }


  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }


  getRegistry(): Registry {
    return this.registry;
  }
}


let metricsInstance: MetricsCollector | null = null;

export const initializeMetrics = (config: MetricsConfig): MetricsCollector => {
  if (!metricsInstance) {
    metricsInstance = new MetricsCollector(config);
  }
  return metricsInstance;
};

export const getMetrics = (): MetricsCollector => {
  if (!metricsInstance) {
    throw new Error('Metrics not initialized. Call initializeMetrics first.');
  }
  return metricsInstance;
};
