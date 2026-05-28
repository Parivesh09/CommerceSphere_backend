# Service Observability Integration Checklist

Use this checklist when adding observability to a microservice.

## Prerequisites

- [ ] Observability stack is running (`docker-compose -f docker-compose.observability.yml up -d`)
- [ ] Service has `@commercesphere/utils` dependency in package.json
- [ ] Dependencies are installed (`npm install`)

## Code Changes

### 1. Import Observability Utilities

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
  readinessCheckHandler,
  metricsEndpointHandler,
} from '@commercesphere/utils';
```

- [ ] Imports added to main service file

### 2. Initialize Observability Components

```typescript
const serviceName = 'your-service-name'; // e.g., 'order-service'

const logger = createLogger({
  serviceName,
  level: process.env.LOG_LEVEL || 'info',
});

const metrics = initializeMetrics({
  serviceName,
  enableDefaultMetrics: true,
});

const tracer = initializeTracer(serviceName);
```

- [ ] Logger initialized
- [ ] Metrics initialized
- [ ] Tracer initialized
- [ ] Service name is descriptive and consistent

### 3. Apply Middleware (Order Matters!)

```typescript

app.use(express.json());


app.use(correlationMiddleware());           // 1. Generate/extract correlation ID
app.use(requestLoggingMiddleware(logger));  // 2. Log requests
app.use(metricsMiddleware());               // 3. Collect metrics





app.use(errorLoggingMiddleware(logger));
```

- [ ] Middleware applied in correct order
- [ ] Correlation middleware is first
- [ ] Error logging middleware is last

### 4. Add Observability Endpoints

```typescript

app.get('/health', healthCheckHandler());


app.get('/ready', readinessCheckHandler([
  async () => {

    try {
      await db.ping();
      return true;
    } catch {
      return false;
    }
  },
  async () => {

    try {
      await redis.ping();
      return true;
    } catch {
      return false;
    }
  },
]));


app.get('/metrics', metricsEndpointHandler());
```

- [ ] `/health` endpoint added
- [ ] `/ready` endpoint added with appropriate checks
- [ ] `/metrics` endpoint added

### 5. Update Logging Calls

Replace console.log with structured logging:

```typescript

console.log('Order created:', orderId);


logger.info('Order created', { orderId, userId, amount });
```

- [ ] All console.log replaced with logger.info
- [ ] All console.error replaced with logger.error
- [ ] Logs include relevant context
- [ ] No sensitive data in logs

### 6. Add Custom Metrics (Optional)

```typescript
import { getMetrics } from '@commercesphere/utils';

const metrics = getMetrics();


const ordersCreated = metrics.createCounter(
  'orders_created_total',
  'Total orders created',
  ['status']
);


ordersCreated.inc({ status: 'success' });
```

- [ ] Custom metrics created for business events
- [ ] Metrics have descriptive names
- [ ] Metrics have appropriate labels

### 7. Add Distributed Tracing (Optional)

```typescript
import { getTracer } from '@commercesphere/utils';

const tracer = getTracer();


const span = tracer.startSpan('process-order');
span.setTag('order.id', orderId);

try {

  span.log({ event: 'order-validated' });

} catch (error) {
  span.setTag('error', true);
  span.log({ event: 'error', message: error.message });
  throw error;
} finally {
  span.finish();
}
```

- [ ] Spans created for significant operations
- [ ] Spans include relevant tags
- [ ] Spans are finished in finally block
- [ ] Errors are tagged in spans

## Configuration

### 8. Update Prometheus Configuration

Add your service to `observability/prometheus/prometheus.yml`:

```yaml
scrape_configs:
  - job_name: 'your-service'
    static_configs:
      - targets: ['your-service:3000']
    metrics_path: '/metrics'
    scrape_interval: 10s
```

- [ ] Service added to Prometheus config
- [ ] Target points to correct host:port
- [ ] Metrics path is correct

### 9. Docker Compose Configuration

If using Docker Compose, add labels:

```yaml
services:
  your-service:
    build: ./services/your-service
    labels:
      - "prometheus.scrape=true"
      - "prometheus.port=3000"
      - "prometheus.path=/metrics"
```

- [ ] Prometheus labels added
- [ ] Port is correct
- [ ] Path is correct

### 10. Kubernetes Configuration

If using Kubernetes, add annotations:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: your-service
spec:
  template:
    metadata:
      annotations:
        prometheus.io/scrape: "true"
        prometheus.io/port: "3000"
        prometheus.io/path: "/metrics"
```

- [ ] Prometheus annotations added
- [ ] Port is correct
- [ ] Path is correct

## Testing

### 11. Local Testing

```bash
# Start your service
npm run dev

# Test health endpoint
curl http://localhost:3000/health
# Expected: {"status":"healthy","timestamp":"...","uptime":...}

# Test readiness endpoint
curl http://localhost:3000/ready
# Expected: {"status":"ready","timestamp":"..."}

# Test metrics endpoint
curl http://localhost:3000/metrics
# Expected: Prometheus metrics in text format

# Generate some traffic
curl -X POST http://localhost:3000/api/your-endpoint \
  -H "Content-Type: application/json" \
  -d '{"test":"data"}'

# Check metrics again
curl http://localhost:3000/metrics | grep http_requests_total
```

- [ ] Health endpoint returns 200
- [ ] Readiness endpoint returns 200
- [ ] Metrics endpoint returns Prometheus format
- [ ] Metrics update after requests

### 12. Verify in Observability Tools

**Prometheus**:
```bash
# Open http://localhost:9090
# Go to Status → Targets
# Verify your service is listed and UP
```

- [ ] Service appears in Prometheus targets
- [ ] Target status is UP
- [ ] Metrics are being scraped

**Grafana**:
```bash
# Open http://localhost:3001 (admin/admin)
# Go to Explore
# Query: rate(your_service_http_requests_total[5m])
```

- [ ] Metrics visible in Grafana
- [ ] Service appears in dashboards
- [ ] Graphs show data

**Kibana**:
```bash
# Open http://localhost:5601
# Go to Discover
# Search: service:"your-service"
```

- [ ] Logs appear in Kibana
- [ ] Logs have correct structure
- [ ] Correlation IDs present

**Jaeger** (if tracing implemented):
```bash
# Open http://localhost:16686
# Select your service
# Click "Find Traces"
```

- [ ] Service appears in Jaeger
- [ ] Traces are visible
- [ ] Spans show correct operations

## Documentation

### 13. Update Service README

Add observability section to your service's README.md:

```markdown
## Observability

This service includes full observability support:

- **Metrics**: Exposed at `/metrics` for Prometheus
- **Health Check**: Available at `/health`
- **Readiness Check**: Available at `/ready`
- **Logging**: Structured JSON logs with correlation IDs
- **Tracing**: Distributed tracing support

### Custom Metrics

- `your_service_orders_created_total` - Total orders created
- `your_service_order_processing_duration_seconds` - Order processing time

### Monitoring

View metrics in Grafana: http://localhost:3001
View logs in Kibana: http://localhost:5601
View traces in Jaeger: http://localhost:16686
```

- [ ] README updated with observability info
- [ ] Custom metrics documented
- [ ] Monitoring URLs included

## Verification

### 14. Final Checks

Run the verification script:

```bash
./observability/verify-setup.sh
```

- [ ] All observability services are healthy
- [ ] Your service is being scraped by Prometheus
- [ ] Logs are appearing in Elasticsearch
- [ ] Metrics are visible in Grafana

### 15. Load Testing

Generate load and verify observability:

```bash
# Install hey if not already installed
# macOS: brew install hey
# Linux: go install github.com/rakyll/hey@latest

# Generate load
hey -n 1000 -c 10 http://localhost:3000/api/your-endpoint

# Check Grafana for:
# - Request rate spike
# - Latency metrics
# - Error rate (should be low)

# Check Kibana for:
# - Log volume increase
# - No error logs (or expected errors only)

# Check Jaeger for:
# - Trace volume increase
# - Latency distribution
```

- [ ] Service handles load without errors
- [ ] Metrics reflect the load
- [ ] Logs are generated correctly
- [ ] No performance degradation

## Common Issues

### Issue: Metrics endpoint returns 500

**Solution**: Ensure metrics are initialized before middleware:
```typescript
const metrics = initializeMetrics({ serviceName });

app.use(metricsMiddleware());
```

### Issue: Correlation IDs not in logs

**Solution**: Ensure correlation middleware is applied first:
```typescript
app.use(correlationMiddleware());  // Must be first!
app.use(requestLoggingMiddleware(logger));
```

### Issue: Service not in Prometheus targets

**Solution**: 
1. Check Prometheus config includes your service
2. Verify service is reachable from Prometheus container
3. Restart Prometheus: `docker-compose -f docker-compose.observability.yml restart prometheus`

### Issue: Logs not in Kibana

**Solution**:
1. Check log format is JSON
2. Verify Logstash is running
3. Check Elasticsearch indices: `curl http://localhost:9200/_cat/indices`
4. Create index pattern in Kibana: `commercesphere-logs-*`

## Resources

- [Observability README](./README.md)
- [Setup Guide](./SETUP_GUIDE.md)
- [Quick Reference](./QUICK_REFERENCE.md)
- [Example Service](./examples/service-with-observability.ts)

## Completion

- [ ] All checklist items completed
- [ ] Service tested locally
- [ ] Observability verified in all tools
- [ ] Documentation updated
- [ ] Code reviewed
- [ ] Ready for deployment

---

**Date Completed**: _______________

**Completed By**: _______________

**Notes**: _______________
