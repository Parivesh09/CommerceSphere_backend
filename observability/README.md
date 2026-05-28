# CommerceSphere Observability Infrastructure

This directory contains the configuration for the complete observability stack for CommerceSphere microservices platform.

## Components

### 1. Prometheus (Metrics Collection)
- **Port**: 9090
- **Purpose**: Collects and stores time-series metrics from all services
- **Access**: http://localhost:9090

### 2. Grafana (Metrics Visualization)
- **Port**: 3001
- **Purpose**: Visualizes metrics with dashboards
- **Access**: http://localhost:3001
- **Default Credentials**: admin/admin

### 3. Elasticsearch (Log Storage)
- **Port**: 9200
- **Purpose**: Stores and indexes application logs
- **Access**: http://localhost:9200

### 4. Logstash (Log Processing)
- **Port**: 5000 (TCP/UDP)
- **Purpose**: Processes and forwards logs to Elasticsearch
- **Access**: Logs sent to tcp://localhost:5000

### 5. Kibana (Log Visualization)
- **Port**: 5601
- **Purpose**: Visualizes and searches logs
- **Access**: http://localhost:5601

### 6. Jaeger (Distributed Tracing)
- **Port**: 16686 (UI), 14268 (collector)
- **Purpose**: Distributed tracing across microservices
- **Access**: http://localhost:16686

## Quick Start

### Start Observability Stack

```bash
# Start all observability services
docker-compose -f docker-compose.observability.yml up -d

# Check status
docker-compose -f docker-compose.observability.yml ps

# View logs
docker-compose -f docker-compose.observability.yml logs -f
```

### Stop Observability Stack

```bash
docker-compose -f docker-compose.observability.yml down

# Remove volumes (WARNING: deletes all data)
docker-compose -f docker-compose.observability.yml down -v
```

## Service Integration

### Adding Observability to a Service

1. **Install Dependencies**

```bash
npm install @commercesphere/utils
```

2. **Initialize in Your Service**

```typescript
import express from 'express';
import {
  createLogger,
  initializeMetrics,
  initializeTracer,
  correlationMiddleware,
  requestLoggingMiddleware,
  metricsMiddleware,
  errorLoggingMiddleware,
  healthCheckHandler,
  readinessCheckHandler,
  metricsEndpointHandler,
} from '@commercesphere/utils';

const app = express();
const serviceName = 'my-service';


const logger = createLogger({ serviceName, level: 'info' });
const metrics = initializeMetrics({ serviceName });
const tracer = initializeTracer(serviceName);


app.use(correlationMiddleware());
app.use(requestLoggingMiddleware(logger));
app.use(metricsMiddleware());


app.get('/api/example', (req, res) => {
  logger.info('Example endpoint called');
  res.json({ message: 'Hello' });
});


app.use(errorLoggingMiddleware(logger));


app.get('/health', healthCheckHandler());
app.get('/ready', readinessCheckHandler([
  async () => {

    return true;
  }
]));


app.get('/metrics', metricsEndpointHandler());

app.listen(3000, () => {
  logger.info('Service started', { port: 3000 });
});
```

3. **Configure Logging to Logstash** (Optional)

```typescript
import winston from 'winston';
import 'winston-logstash';

const logger = winston.createLogger({
  transports: [
    new winston.transports.Logstash({
      port: 5000,
      host: 'localhost',
      node_name: serviceName,
    }),
  ],
});
```

## Metrics

### Standard Metrics

All services automatically expose these metrics:

- `{service}_http_requests_total` - Total HTTP requests
- `{service}_http_request_duration_seconds` - Request duration histogram
- `{service}_http_requests_in_flight` - Current requests being processed
- `{service}_errors_total` - Total errors
- `{service}_business_events_total` - Business events counter

### Custom Metrics

Create custom metrics in your service:

```typescript
import { getMetrics } from '@commercesphere/utils';

const metrics = getMetrics();


const ordersCreated = metrics.createCounter(
  'orders_created_total',
  'Total orders created',
  ['status']
);

ordersCreated.inc({ status: 'success' });


const orderProcessingTime = metrics.createHistogram(
  'order_processing_duration_seconds',
  'Order processing duration',
  ['order_type']
);

const timer = orderProcessingTime.startTimer();

timer({ order_type: 'standard' });


const activeConnections = metrics.createGauge(
  'active_connections',
  'Number of active connections'
);

activeConnections.set(42);
```

## Logging

### Log Levels

- `error` - Errors requiring immediate attention
- `warn` - Potential issues, degraded functionality
- `info` - Important business events, state changes
- `debug` - Detailed diagnostic information

### Structured Logging

```typescript
import { createLogger } from '@commercesphere/utils';

const logger = createLogger({ serviceName: 'my-service' });


logger.info('Order created');


logger.info('Order created', {
  orderId: 'order-123',
  userId: 'user-456',
  amount: 99.99,
  items: 3,
});


try {

} catch (error) {
  logger.error('Failed to process order', {
    error: error.message,
    stack: error.stack,
    orderId: 'order-123',
  });
}
```

### Correlation IDs

Correlation IDs are automatically added to all logs when using the middleware:

```typescript

logger.info('Processing request'); // { correlationId: 'abc-123', ... }
```

## Distributed Tracing

### Creating Spans

```typescript
import { getTracer } from '@commercesphere/utils';

const tracer = getTracer();


const span = tracer.startSpan('process-order');
span.setTag('order.id', orderId);
span.setTag('user.id', userId);

try {

  span.log({ event: 'order-validated' });
  

  span.log({ event: 'payment-processed' });
  
} catch (error) {
  span.setTag('error', true);
  span.log({ event: 'error', message: error.message });
  throw error;
} finally {
  span.finish();
}
```

### Propagating Trace Context

```typescript
import axios from 'axios';
import { getTracer } from '@commercesphere/utils';

const tracer = getTracer();


const headers = tracer.inject({
  'Content-Type': 'application/json',
});

await axios.post('http://payment-service/payments', data, { headers });
```

## Dashboards

### Grafana Dashboards

Pre-configured dashboards are available at http://localhost:3001:

1. **Service Overview** - Request rate, error rate, latency, CPU, memory
2. **Business Metrics** - Orders, payments, products (add custom)
3. **Infrastructure** - Database, cache, message queue metrics (add custom)

### Creating Custom Dashboards

1. Open Grafana at http://localhost:3001
2. Login with admin/admin
3. Click "+" → "Dashboard"
4. Add panels with PromQL queries

Example queries:

```promql
# Request rate per service
sum(rate(http_requests_total[5m])) by (service)

# Error rate percentage
sum(rate(http_requests_total{status_code=~"5.."}[5m])) / sum(rate(http_requests_total[5m])) * 100

# P95 latency
histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le, service))

# Active orders
orders_active_total

# Cache hit rate
sum(rate(cache_hits_total[5m])) / (sum(rate(cache_hits_total[5m])) + sum(rate(cache_misses_total[5m]))) * 100
```

## Kibana Log Analysis

### Accessing Logs

1. Open Kibana at http://localhost:5601
2. Go to "Discover"
3. Create index pattern: `commercesphere-logs-*`
4. Search and filter logs

### Useful Queries

```
# Find all errors
level: "error"

# Find logs for specific correlation ID
correlationId: "abc-123-def"

# Find logs for specific service
service: "order-service"

# Find errors in last hour
level: "error" AND @timestamp: [now-1h TO now]

# Find slow requests
duration: >1000
```

## Jaeger Tracing

### Viewing Traces

1. Open Jaeger UI at http://localhost:16686
2. Select service from dropdown
3. Click "Find Traces"
4. Click on a trace to see detailed span information

### Trace Analysis

- **Service dependencies**: See which services call which
- **Latency breakdown**: Identify slow operations
- **Error tracking**: Find failed operations
- **Request flow**: Visualize complete request path

## Alerting (Future Enhancement)

To add alerting, configure Alertmanager:

```yaml
# prometheus/alerts/service-alerts.yml
groups:
  - name: service_alerts
    interval: 30s
    rules:
      - alert: HighErrorRate
        expr: sum(rate(http_requests_total{status_code=~"5.."}[5m])) / sum(rate(http_requests_total[5m])) > 0.05
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "High error rate detected"
          description: "Error rate is {{ $value }}%"
      
      - alert: HighLatency
        expr: histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le, service)) > 2
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High latency detected"
          description: "P95 latency is {{ $value }}s"
```

## Best Practices

### Logging
- Use structured logging with context
- Include correlation IDs in all logs
- Log at appropriate levels
- Don't log sensitive data (passwords, tokens)
- Include error stack traces

### Metrics
- Use consistent naming conventions
- Add relevant labels for filtering
- Don't create too many unique label combinations (cardinality)
- Use histograms for latency, counters for events, gauges for current state

### Tracing
- Create spans for significant operations
- Add relevant tags and logs
- Propagate context across service boundaries
- Keep span names consistent

### Performance
- Metrics collection is lightweight
- Logging can be expensive - use appropriate levels
- Tracing adds overhead - consider sampling in production

## Troubleshooting

### Prometheus not scraping metrics
- Check service is exposing `/metrics` endpoint
- Verify service is reachable from Prometheus container
- Check Prometheus targets page: http://localhost:9090/targets

### Logs not appearing in Kibana
- Verify Logstash is receiving logs: `docker logs logstash`
- Check Elasticsearch indices: http://localhost:9200/_cat/indices
- Ensure index pattern is created in Kibana

### Traces not appearing in Jaeger
- Verify trace context is being propagated
- Check Jaeger collector logs: `docker logs jaeger`
- Ensure spans are being finished

## Production Considerations

### Scaling
- Use Prometheus federation for multiple clusters
- Deploy Elasticsearch cluster with multiple nodes
- Use Kafka for log buffering at scale
- Consider sampling for high-volume tracing

### Security
- Enable authentication on all observability tools
- Use TLS for communication
- Restrict access to observability endpoints
- Sanitize logs to remove sensitive data

### Retention
- Configure Prometheus retention (default: 15 days)
- Set Elasticsearch index lifecycle policies
- Archive old traces from Jaeger

### High Availability
- Run multiple Prometheus instances
- Deploy Elasticsearch cluster
- Use load balancer for Grafana
- Backup configurations and dashboards
