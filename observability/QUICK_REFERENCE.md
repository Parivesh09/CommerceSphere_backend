# Observability Quick Reference

## URLs

| Tool | URL | Credentials |
|------|-----|-------------|
| Prometheus | http://localhost:9090 | None |
| Grafana | http://localhost:3001 | admin/admin |
| Kibana | http://localhost:5601 | None |
| Jaeger | http://localhost:16686 | None |
| Elasticsearch | http://localhost:9200 | None |

## Common Commands

### Start/Stop Observability Stack

```bash
# Start
docker-compose -f docker-compose.observability.yml up -d

# Stop
docker-compose -f docker-compose.observability.yml down

# View logs
docker-compose -f docker-compose.observability.yml logs -f [service]

# Restart service
docker-compose -f docker-compose.observability.yml restart [service]
```

### Check Service Health

```bash
# Prometheus
curl http://localhost:9090/-/healthy

# Grafana
curl http://localhost:3001/api/health

# Elasticsearch
curl http://localhost:9200/_cluster/health

# Your service
curl http://localhost:3000/health
curl http://localhost:3000/ready
curl http://localhost:3000/metrics
```

## Code Snippets

### Initialize Observability

```typescript
import {
  createLogger,
  initializeMetrics,
  initializeTracer,
  correlationMiddleware,
  requestLoggingMiddleware,
  metricsMiddleware,
  errorLoggingMiddleware,
  healthCheckHandler,
  metricsEndpointHandler,
} from '@commercesphere/utils';

const logger = createLogger({ serviceName: 'my-service' });
const metrics = initializeMetrics({ serviceName: 'my-service' });
const tracer = initializeTracer('my-service');

app.use(correlationMiddleware());
app.use(requestLoggingMiddleware(logger));
app.use(metricsMiddleware());
app.use(errorLoggingMiddleware(logger));

app.get('/health', healthCheckHandler());
app.get('/metrics', metricsEndpointHandler());
```

### Logging

```typescript

logger.info('User logged in');


logger.info('Order created', {
  orderId: 'order-123',
  userId: 'user-456',
  amount: 99.99,
});


logger.error('Payment failed', {
  error: error.message,
  stack: error.stack,
  orderId: 'order-123',
});


logger.debug('Debug info');
logger.info('Info message');
logger.warn('Warning message');
logger.error('Error message');
```

### Metrics

```typescript
import { getMetrics } from '@commercesphere/utils';

const metrics = getMetrics();


const counter = metrics.createCounter('orders_total', 'Total orders', ['status']);
counter.inc({ status: 'success' });


const histogram = metrics.createHistogram('order_duration', 'Order duration', ['type']);
const timer = histogram.startTimer();

timer({ type: 'standard' });


const gauge = metrics.createGauge('active_connections', 'Active connections');
gauge.set(42);
gauge.inc();
gauge.dec();


metrics.recordBusinessEvent('order.created', 'success');


metrics.recordError('PaymentError', 'process-payment');
```

### Tracing

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


import axios from 'axios';

const headers = tracer.inject({ 'Content-Type': 'application/json' });
await axios.post('http://payment-service/payments', data, { headers });
```

## Useful Queries

### Prometheus (PromQL)

```promql
# Request rate (per second)
rate(http_requests_total[5m])

# Request rate by service
sum(rate(http_requests_total[5m])) by (service)

# Error rate (percentage)
sum(rate(http_requests_total{status_code=~"5.."}[5m])) 
/ sum(rate(http_requests_total[5m])) * 100

# P50, P95, P99 latency
histogram_quantile(0.50, rate(http_request_duration_seconds_bucket[5m]))
histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))
histogram_quantile(0.99, rate(http_request_duration_seconds_bucket[5m]))

# Requests in flight
sum(http_requests_in_flight) by (service)

# CPU usage
rate(process_cpu_seconds_total[5m]) * 100

# Memory usage (MB)
process_resident_memory_bytes / 1024 / 1024

# Top 5 slowest endpoints
topk(5, histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])))
```

### Kibana (KQL)

```
# All errors
level: "error"

# Errors in last hour
level: "error" AND @timestamp >= now-1h

# Specific service
service: "order-service"

# Specific correlation ID
correlationId: "abc-123-def"

# Errors for specific user
level: "error" AND userId: "user-456"

# Slow requests (>1 second)
duration > 1000

# Multiple conditions
service: "order-service" AND level: "error" AND @timestamp >= now-1h

# Pattern matching
message: *payment* AND level: "error"
```

### Elasticsearch (REST API)

```bash
# Get all indices
curl http://localhost:9200/_cat/indices

# Search logs
curl -X GET "http://localhost:9200/commercesphere-logs-*/_search" -H 'Content-Type: application/json' -d'
{
  "query": {
    "bool": {
      "must": [
        { "match": { "level": "error" } },
        { "range": { "@timestamp": { "gte": "now-1h" } } }
      ]
    }
  },
  "size": 100
}'

# Aggregation - errors by service
curl -X GET "http://localhost:9200/commercesphere-logs-*/_search" -H 'Content-Type: application/json' -d'
{
  "size": 0,
  "query": { "match": { "level": "error" } },
  "aggs": {
    "by_service": {
      "terms": { "field": "service.keyword" }
    }
  }
}'
```

## Debugging Checklist

### Service Not Reporting Metrics

- [ ] Check `/metrics` endpoint is accessible
- [ ] Verify metrics middleware is applied
- [ ] Check Prometheus targets page
- [ ] Review Prometheus logs
- [ ] Verify service is in Prometheus config

### Logs Not Appearing

- [ ] Check log format is JSON
- [ ] Verify Logstash is running
- [ ] Check Elasticsearch indices exist
- [ ] Verify index pattern in Kibana
- [ ] Review Logstash logs

### Traces Not Appearing

- [ ] Verify tracer is initialized
- [ ] Check spans are being finished
- [ ] Verify trace context propagation
- [ ] Review Jaeger collector logs
- [ ] Check Jaeger UI for service

### High Latency

- [ ] Check P95/P99 latency metrics
- [ ] Review slow query logs
- [ ] Check database connection pool
- [ ] Review cache hit rate
- [ ] Check external service latency
- [ ] Review distributed traces

### High Error Rate

- [ ] Check error logs in Kibana
- [ ] Review error metrics by endpoint
- [ ] Check database errors
- [ ] Review external service errors
- [ ] Check circuit breaker status

## Alert Thresholds

| Metric | Warning | Critical |
|--------|---------|----------|
| Error Rate | > 1% | > 5% |
| P95 Latency | > 1s | > 2s |
| P99 Latency | > 2s | > 5s |
| CPU Usage | > 70% | > 90% |
| Memory Usage | > 80% | > 95% |
| Disk Usage | > 80% | > 90% |

## Performance Tips

### Logging
- Use appropriate log levels (avoid debug in production)
- Don't log in tight loops
- Use structured logging
- Avoid logging large payloads

### Metrics
- Keep label cardinality low
- Use histograms for latency
- Use counters for events
- Use gauges for current state

### Tracing
- Use sampling in production (e.g., 10%)
- Create spans for significant operations only
- Add relevant tags, not everything
- Finish spans in finally blocks

## Common Issues

### Issue: Prometheus "context deadline exceeded"
**Solution**: Increase scrape timeout in prometheus.yml

### Issue: Elasticsearch "circuit breaker" error
**Solution**: Increase heap size or reduce query size

### Issue: Grafana dashboard not loading
**Solution**: Check Prometheus data source connection

### Issue: Logs missing correlation ID
**Solution**: Ensure correlation middleware is first

### Issue: High memory usage
**Solution**: Check metric cardinality, reduce labels

## Support

- Documentation: `/observability/README.md`
- Setup Guide: `/observability/SETUP_GUIDE.md`
- Examples: `/observability/examples/`
- Issues: Create GitHub issue with `observability` label
