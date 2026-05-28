# Observability Setup Guide

This guide walks you through setting up complete observability for CommerceSphere microservices.

## Prerequisites

- Docker and Docker Compose installed
- Node.js 20+ for TypeScript services
- Python 3.11+ for Python services
- Access to the CommerceSphere repository

## Step 1: Start Observability Stack

### Local Development

```bash
# Start all observability services
docker-compose -f docker-compose.observability.yml up -d

# Verify all services are running
docker-compose -f docker-compose.observability.yml ps

# Expected output:
# - prometheus (running on port 9090)
# - grafana (running on port 3001)
# - elasticsearch (running on port 9200)
# - logstash (running on port 5000)
# - kibana (running on port 5601)
# - jaeger (running on port 16686)
```

### Verify Services

```bash
# Check Prometheus
curl http://localhost:9090/-/healthy

# Check Grafana
curl http://localhost:3001/api/health

# Check Elasticsearch
curl http://localhost:9200/_cluster/health

# Check Jaeger
curl http://localhost:16686/
```

## Step 2: Update Service Dependencies

For each TypeScript service, update `package.json`:

```json
{
  "dependencies": {
    "@commercesphere/utils": "*",
    "express": "^4.18.2"
  }
}
```

Install dependencies:

```bash
cd services/your-service
npm install
```

## Step 3: Initialize Observability in Services

### TypeScript Services

Update your service's main file (e.g., `src/index.ts`):

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
const serviceName = 'your-service-name';


const logger = createLogger({ serviceName });
const metrics = initializeMetrics({ serviceName });
const tracer = initializeTracer(serviceName);


app.use(express.json());
app.use(correlationMiddleware());
app.use(requestLoggingMiddleware(logger));
app.use(metricsMiddleware());





app.get('/health', healthCheckHandler());
app.get('/ready', readinessCheckHandler([
  async () => {

    return true;
  }
]));
app.get('/metrics', metricsEndpointHandler());


app.use(errorLoggingMiddleware(logger));


app.listen(3000, () => {
  logger.info('Service started', { port: 3000 });
});
```

### Python Services (FastAPI)

For Python services like the Recommendation Service:

```python
from fastapi import FastAPI, Request
from prometheus_client import Counter, Histogram, generate_latest
import logging
import time
import uuid

app = FastAPI()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='{"timestamp":"%(asctime)s","level":"%(levelname)s","service":"recommendation-service","message":"%(message)s"}'
)
logger = logging.getLogger(__name__)

# Metrics
request_count = Counter(
    'recommendation_service_http_requests_total',
    'Total HTTP requests',
    ['method', 'endpoint', 'status']
)

request_duration = Histogram(
    'recommendation_service_http_request_duration_seconds',
    'HTTP request duration',
    ['method', 'endpoint']
)

# Middleware for correlation ID
@app.middleware("http")
async def add_correlation_id(request: Request, call_next):
    correlation_id = request.headers.get('x-correlation-id', str(uuid.uuid4()))
    request.state.correlation_id = correlation_id
    
    start_time = time.time()
    response = await call_next(request)
    duration = time.time() - start_time
    
    response.headers['x-correlation-id'] = correlation_id
    
    # Record metrics
    request_count.labels(
        method=request.method,
        endpoint=request.url.path,
        status=response.status_code
    ).inc()
    
    request_duration.labels(
        method=request.method,
        endpoint=request.url.path
    ).observe(duration)
    
    return response

# Health endpoints
@app.get("/health")
async def health():
    return {"status": "healthy"}

@app.get("/ready")
async def ready():
    return {"status": "ready"}

@app.get("/metrics")
async def metrics():
    return Response(
        content=generate_latest(),
        media_type="text/plain"
    )
```

## Step 4: Add Service Annotations for Prometheus

### Docker Compose

If using Docker Compose, ensure services expose metrics port:

```yaml
services:
  your-service:
    build: ./services/your-service
    ports:
      - "3000:3000"
    labels:
      - "prometheus.scrape=true"
      - "prometheus.port=3000"
      - "prometheus.path=/metrics"
```

### Kubernetes

Add annotations to pod templates:

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
    spec:
      containers:
        - name: your-service
          image: your-service:latest
          ports:
            - containerPort: 3000
```

## Step 5: Configure Prometheus Scraping

Update `observability/prometheus/prometheus.yml` to add your service:

```yaml
scrape_configs:
  - job_name: 'your-service'
    static_configs:
      - targets: ['your-service:3000']
    metrics_path: '/metrics'
    scrape_interval: 10s
```

Reload Prometheus configuration:

```bash
# If using Docker Compose
docker-compose -f docker-compose.observability.yml restart prometheus

# If using Kubernetes
kubectl rollout restart deployment/prometheus -n observability
```

## Step 6: Access Observability Tools

### Grafana

1. Open http://localhost:3001
2. Login with `admin` / `admin`
3. Navigate to Dashboards → Browse
4. Open "CommerceSphere - Service Overview"

### Prometheus

1. Open http://localhost:9090
2. Go to Status → Targets to verify services are being scraped
3. Use the query interface to explore metrics

Example queries:
```promql
# Request rate
rate(http_requests_total[5m])

# Error rate
rate(http_requests_total{status_code=~"5.."}[5m])

# P95 latency
histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))
```

### Kibana (Logs)

1. Open http://localhost:5601
2. Go to Management → Stack Management → Index Patterns
3. Create index pattern: `commercesphere-logs-*`
4. Go to Discover to view logs

### Jaeger (Traces)

1. Open http://localhost:16686
2. Select service from dropdown
3. Click "Find Traces"
4. Explore trace details

## Step 7: Create Custom Dashboards

### Grafana Dashboard

1. Open Grafana
2. Click "+" → "Dashboard"
3. Add Panel
4. Configure query:

```promql
# Example: Orders per minute
rate(orders_processed_total[1m]) * 60
```

5. Save dashboard

### Kibana Visualization

1. Open Kibana
2. Go to Visualize Library
3. Create visualization
4. Select index pattern
5. Configure aggregations
6. Save visualization

## Step 8: Set Up Alerts (Optional)

### Prometheus Alerts

Create `observability/prometheus/alerts/service-alerts.yml`:

```yaml
groups:
  - name: service_alerts
    interval: 30s
    rules:
      - alert: HighErrorRate
        expr: |
          sum(rate(http_requests_total{status_code=~"5.."}[5m])) 
          / sum(rate(http_requests_total[5m])) > 0.05
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "High error rate detected"
          description: "Error rate is {{ $value | humanizePercentage }}"
```

## Step 9: Test Observability

### Generate Test Traffic

```bash
# Install hey (HTTP load generator)
# macOS: brew install hey
# Linux: go install github.com/rakyll/hey@latest

# Generate load
hey -n 1000 -c 10 http://localhost:3000/api/orders
```

### Verify Metrics

```bash
# Check metrics endpoint
curl http://localhost:3000/metrics

# Should see output like:
# your_service_http_requests_total{method="GET",route="/api/orders",status_code="200"} 1000
# your_service_http_request_duration_seconds_bucket{method="GET",route="/api/orders",le="0.1"} 950
```

### Verify Logs

```bash
# Check Kibana
# Open http://localhost:5601
# Search for: service:"your-service" AND level:"info"
```

### Verify Traces

```bash
# Check Jaeger
# Open http://localhost:16686
# Select your service and click "Find Traces"
```

## Step 10: Production Deployment

### Kubernetes Deployment

1. Deploy observability stack:

```bash
kubectl create namespace observability
kubectl apply -f observability/kubernetes/
```

2. Deploy services with observability:

```bash
kubectl apply -f k8s/services/
```

3. Verify Prometheus targets:

```bash
kubectl port-forward -n observability svc/prometheus 9090:9090
# Open http://localhost:9090/targets
```

### Security Considerations

1. **Enable Authentication**:
   - Grafana: Change default password
   - Prometheus: Use basic auth or OAuth
   - Kibana: Enable X-Pack security

2. **Network Policies**:
   - Restrict access to observability tools
   - Use service mesh for mTLS

3. **Data Retention**:
   - Configure Prometheus retention
   - Set Elasticsearch ILM policies
   - Archive old traces

## Troubleshooting

### Metrics Not Appearing

**Problem**: Service metrics not showing in Prometheus

**Solutions**:
1. Check `/metrics` endpoint is accessible:
   ```bash
   curl http://your-service:3000/metrics
   ```

2. Verify Prometheus configuration:
   ```bash
   docker exec prometheus cat /etc/prometheus/prometheus.yml
   ```

3. Check Prometheus targets:
   - Open http://localhost:9090/targets
   - Look for your service
   - Check error messages

### Logs Not Appearing

**Problem**: Logs not showing in Kibana

**Solutions**:
1. Check Logstash is receiving logs:
   ```bash
   docker logs logstash
   ```

2. Verify Elasticsearch indices:
   ```bash
   curl http://localhost:9200/_cat/indices
   ```

3. Check log format matches Logstash pipeline

### Traces Not Appearing

**Problem**: Traces not showing in Jaeger

**Solutions**:
1. Verify trace context propagation
2. Check spans are being finished
3. Review Jaeger collector logs:
   ```bash
   docker logs jaeger
   ```

## Best Practices

### Logging
- Use structured logging (JSON format)
- Include correlation IDs
- Log at appropriate levels
- Don't log sensitive data

### Metrics
- Use consistent naming conventions
- Add relevant labels
- Avoid high cardinality labels
- Monitor metric cardinality

### Tracing
- Create spans for significant operations
- Add relevant tags
- Propagate context across boundaries
- Consider sampling in production

### Performance
- Metrics collection is lightweight
- Use appropriate log levels
- Consider trace sampling
- Monitor observability overhead

## Next Steps

1. Create custom dashboards for your services
2. Set up alerting rules
3. Configure log retention policies
4. Implement distributed tracing across all services
5. Add business metrics specific to your domain
6. Set up on-call rotation and incident response

## Resources

- [Prometheus Documentation](https://prometheus.io/docs/)
- [Grafana Documentation](https://grafana.com/docs/)
- [Elastic Stack Documentation](https://www.elastic.co/guide/)
- [Jaeger Documentation](https://www.jaegertracing.io/docs/)
- [OpenTelemetry](https://opentelemetry.io/)
