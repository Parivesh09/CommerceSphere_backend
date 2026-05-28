# Monitoring and Alerting Guide

## Overview

CommerceSphere uses a comprehensive observability stack to monitor system health, track performance metrics, and alert on issues. This guide covers the setup and configuration of monitoring and alerting infrastructure.

## Observability Stack

### Components

- **Prometheus:** Metrics collection and storage
- **Grafana:** Metrics visualization and dashboards
- **ELK Stack:** Centralized logging (Elasticsearch, Logstash, Kibana)
- **Jaeger:** Distributed tracing
- **AlertManager:** Alert routing and management
- **PagerDuty:** Incident management and on-call rotation

### Architecture

```
┌─────────────────────────────────────────────────────┐
│              Microservices                          │
│  (Emit metrics, logs, and traces)                   │
└────────┬──────────────┬──────────────┬──────────────┘
         │              │              │
         ▼              ▼              ▼
┌─────────────┐  ┌──────────┐  ┌──────────────┐
│ Prometheus  │  │ Logstash │  │    Jaeger    │
│  (Metrics)  │  │  (Logs)  │  │   (Traces)   │
└──────┬──────┘  └────┬─────┘  └──────┬───────┘
       │              │               │
       ▼              ▼               ▼
┌─────────────┐  ┌──────────┐  ┌──────────────┐
│   Grafana   │  │  Kibana  │  │ Jaeger UI    │
│(Dashboards) │  │(Log View)│  │(Trace View)  │
└─────────────┘  └──────────┘  └──────────────┘
       │
       ▼
┌─────────────┐
│AlertManager │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ PagerDuty   │
└─────────────┘
```

## Metrics Collection with Prometheus

### Installation

```bash
# Add Prometheus Helm repository
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update

# Install Prometheus stack
helm install prometheus prometheus-community/kube-prometheus-stack \
  --namespace monitoring \
  --create-namespace \
  --set prometheus.prometheusSpec.serviceMonitorSelectorNilUsesHelmValues=false \
  --set prometheus.prometheusSpec.retention=30d \
  --set prometheus.prometheusSpec.storageSpec.volumeClaimTemplate.spec.resources.requests.storage=100Gi
```

### Service Monitors

Create ServiceMonitor resources to scrape metrics from services:

```yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: product-service-monitor
  namespace: monitoring
  labels:
    app: product-service
spec:
  selector:
    matchLabels:
      app: product-service
  endpoints:
  - port: http
    path: /metrics
    interval: 30s
    scrapeTimeout: 10s
```

Apply for all services:

```bash
kubectl apply -f observability/prometheus/service-monitors/
```

### Key Metrics

#### RED Metrics (Request, Error, Duration)

**Request Rate:**
```promql
rate(http_requests_total[5m])
```

**Error Rate:**
```promql
rate(http_requests_total{status=~"5.."}[5m]) / rate(http_requests_total[5m])
```

**Duration (Latency):**
```promql
histogram_quantile(0.99, rate(http_request_duration_seconds_bucket[5m]))
```

#### USE Metrics (Utilization, Saturation, Errors)

**CPU Utilization:**
```promql
rate(container_cpu_usage_seconds_total[5m])
```

**Memory Utilization:**
```promql
container_memory_usage_bytes / container_spec_memory_limit_bytes
```

**Saturation (CPU Throttling):**
```promql
rate(container_cpu_cfs_throttled_seconds_total[5m])
```

#### Business Metrics

**Orders per Minute:**
```promql
rate(orders_created_total[1m]) * 60
```

**Revenue per Hour:**
```promql
rate(revenue_total[1h]) * 3600
```

**Active Users:**
```promql
active_users_gauge
```

### Custom Metrics

Services expose custom metrics at `/metrics` endpoint:

```typescript

import { Counter, Histogram, Gauge } from 'prom-client';


const productsCreated = new Counter({
  name: 'products_created_total',
  help: 'Total number of products created',
  labelNames: ['category']
});


const productQueryDuration = new Histogram({
  name: 'product_query_duration_seconds',
  help: 'Duration of product queries',
  buckets: [0.1, 0.5, 1, 2, 5]
});


const inventoryLevel = new Gauge({
  name: 'inventory_level',
  help: 'Current inventory level',
  labelNames: ['product_id']
});


productsCreated.inc({ category: 'electronics' });
productQueryDuration.observe(0.234);
inventoryLevel.set({ product_id: 'prod-123' }, 50);
```

### Accessing Prometheus

```bash
# Port forward to Prometheus
kubectl port-forward -n monitoring svc/prometheus-kube-prometheus-prometheus 9090:9090

# Open http://localhost:9090
```

## Visualization with Grafana

### Installation

Grafana is included in the Prometheus stack installation.

### Accessing Grafana

```bash
# Get admin password
kubectl get secret -n monitoring prometheus-grafana \
  -o jsonpath="{.data.admin-password}" | base64 --decode

# Port forward to Grafana
kubectl port-forward -n monitoring svc/prometheus-grafana 3000:80

# Open http://localhost:3000
# Username: admin
# Password: <from above command>
```

### Pre-configured Dashboards

#### 1. Service Overview Dashboard

Displays key metrics for all services:
- Request rate
- Error rate
- Response time (p50, p95, p99)
- Active instances
- CPU and memory usage

**Import:** `observability/grafana/dashboards/service-overview.json`

#### 2. Infrastructure Dashboard

Displays cluster-level metrics:
- Node CPU and memory usage
- Pod count
- Network I/O
- Disk usage

**Import:** Kubernetes cluster monitoring (Dashboard ID: 315)

#### 3. Database Dashboard

Displays PostgreSQL metrics:
- Active connections
- Query performance
- Cache hit ratio
- Replication lag

**Import:** PostgreSQL Database (Dashboard ID: 9628)

#### 4. Kafka Dashboard

Displays Kafka metrics:
- Message throughput
- Consumer lag
- Broker health
- Topic metrics

**Import:** Kafka Overview (Dashboard ID: 7589)

#### 5. Business Metrics Dashboard

Displays business KPIs:
- Orders per minute
- Revenue per hour
- Conversion rate
- Top products
- Active users

**Import:** `observability/grafana/dashboards/business-metrics.json`

### Creating Custom Dashboards

1. **Navigate to Dashboards → New Dashboard**
2. **Add Panel**
3. **Configure Query:**
   ```promql
   rate(http_requests_total{service="product-service"}[5m])
   ```
4. **Set Visualization Type:** Time series, gauge, stat, etc.
5. **Configure Thresholds and Alerts**
6. **Save Dashboard**

### Dashboard Variables

Use variables for dynamic dashboards:

```
Name: service
Type: Query
Query: label_values(http_requests_total, service)
```

Use in queries:
```promql
rate(http_requests_total{service="$service"}[5m])
```

## Centralized Logging with ELK Stack

### Installation

#### Elasticsearch

```bash
helm repo add elastic https://helm.elastic.co
helm repo update

helm install elasticsearch elastic/elasticsearch \
  --namespace logging \
  --create-namespace \
  --set replicas=3 \
  --set volumeClaimTemplate.resources.requests.storage=100Gi
```

#### Logstash

```bash
kubectl apply -f observability/logstash/
```

Logstash configuration (`observability/logstash/pipeline/logstash.conf`):

```
input {
  beats {
    port => 5044
  }
}

filter {
  json {
    source => "message"
  }
  
  date {
    match => ["timestamp", "ISO8601"]
    target => "@timestamp"
  }
  
  mutate {
    add_field => {
      "environment" => "production"
    }
  }
}

output {
  elasticsearch {
    hosts => ["elasticsearch-master:9200"]
    index => "commercesphere-%{+YYYY.MM.dd}"
  }
}
```

#### Kibana

```bash
helm install kibana elastic/kibana \
  --namespace logging \
  --set elasticsearchHosts=http://elasticsearch-master:9200
```

#### Filebeat (Log Shipper)

```bash
kubectl apply -f observability/filebeat/
```

### Accessing Kibana

```bash
# Port forward to Kibana
kubectl port-forward -n logging svc/kibana-kibana 5601:5601

# Open http://localhost:5601
```

### Log Structure

All services emit structured JSON logs:

```json
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "level": "INFO",
  "service": "product-service",
  "correlationId": "abc-123-def",
  "message": "Product created successfully",
  "context": {
    "productId": "prod-456",
    "userId": "user-789",
    "category": "electronics"
  },
  "duration": 234,
  "statusCode": 201
}
```

### Kibana Index Patterns

Create index pattern:
1. Navigate to **Management → Index Patterns**
2. Create pattern: `commercesphere-*`
3. Select time field: `@timestamp`

### Useful Kibana Queries

**Find errors:**
```
level: ERROR
```

**Find slow requests:**
```
duration > 1000
```

**Find requests by user:**
```
context.userId: "user-123"
```

**Find requests by correlation ID:**
```
correlationId: "abc-123-def"
```

### Log Retention

Configure index lifecycle management:

```bash
# Create ILM policy
curl -X PUT "http://localhost:9200/_ilm/policy/commercesphere-policy" \
  -H 'Content-Type: application/json' \
  -d '{
    "policy": {
      "phases": {
        "hot": {
          "actions": {
            "rollover": {
              "max_size": "50GB",
              "max_age": "1d"
            }
          }
        },
        "warm": {
          "min_age": "7d",
          "actions": {
            "shrink": {
              "number_of_shards": 1
            }
          }
        },
        "delete": {
          "min_age": "30d",
          "actions": {
            "delete": {}
          }
        }
      }
    }
  }'
```

## Distributed Tracing with Jaeger

### Installation

```bash
# Install Jaeger Operator
kubectl create namespace observability
kubectl apply -f https://github.com/jaegertracing/jaeger-operator/releases/download/v1.51.0/jaeger-operator.yaml -n observability

# Deploy Jaeger instance
kubectl apply -f observability/jaeger/jaeger-instance.yaml
```

### Jaeger Instance Configuration

```yaml
apiVersion: jaegertracing.io/v1
kind: Jaeger
metadata:
  name: commercesphere-jaeger
  namespace: observability
spec:
  strategy: production
  storage:
    type: elasticsearch
    options:
      es:
        server-urls: http://elasticsearch-master.logging:9200
  ingress:
    enabled: true
```

### Instrumenting Services

Services use OpenTelemetry for tracing:

```typescript
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { JaegerExporter } from '@opentelemetry/exporter-jaeger';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';

const provider = new NodeTracerProvider();

const exporter = new JaegerExporter({
  endpoint: 'http://jaeger-collector:14268/api/traces',
  serviceName: 'product-service'
});

provider.addSpanProcessor(new BatchSpanProcessor(exporter));
provider.register();

registerInstrumentations({
  instrumentations: [
    new HttpInstrumentation(),
    new ExpressInstrumentation()
  ]
});
```

### Accessing Jaeger UI

```bash
# Port forward to Jaeger
kubectl port-forward -n observability svc/commercesphere-jaeger-query 16686:16686

# Open http://localhost:16686
```

### Trace Analysis

**Find slow traces:**
1. Select service
2. Set min duration: 1000ms
3. Click "Find Traces"

**Analyze trace:**
- View span timeline
- Check span tags
- Identify bottlenecks
- View logs associated with spans

## Alerting with AlertManager

### Installation

AlertManager is included in the Prometheus stack.

### Alert Rules

Create PrometheusRule resources:

```yaml
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: commercesphere-alerts
  namespace: monitoring
spec:
  groups:
  - name: service-alerts
    interval: 30s
    rules:
    # High error rate
    - alert: HighErrorRate
      expr: |
        rate(http_requests_total{status=~"5.."}[5m]) / rate(http_requests_total[5m]) > 0.05
      for: 5m
      labels:
        severity: critical
      annotations:
        summary: "High error rate on {{ $labels.service }}"
        description: "Error rate is {{ $value | humanizePercentage }} on {{ $labels.service }}"
    
    # High response time
    - alert: HighResponseTime
      expr: |
        histogram_quantile(0.99, rate(http_request_duration_seconds_bucket[5m])) > 2
      for: 5m
      labels:
        severity: warning
      annotations:
        summary: "High response time on {{ $labels.service }}"
        description: "P99 latency is {{ $value }}s on {{ $labels.service }}"
    
    # Service down
    - alert: ServiceDown
      expr: up{job=~".*-service"} == 0
      for: 1m
      labels:
        severity: critical
      annotations:
        summary: "Service {{ $labels.job }} is down"
        description: "{{ $labels.job }} has been down for more than 1 minute"
    
    # High CPU usage
    - alert: HighCPUUsage
      expr: |
        rate(container_cpu_usage_seconds_total[5m]) > 0.8
      for: 10m
      labels:
        severity: warning
      annotations:
        summary: "High CPU usage on {{ $labels.pod }}"
        description: "CPU usage is {{ $value | humanizePercentage }} on {{ $labels.pod }}"
    
    # High memory usage
    - alert: HighMemoryUsage
      expr: |
        container_memory_usage_bytes / container_spec_memory_limit_bytes > 0.9
      for: 5m
      labels:
        severity: warning
      annotations:
        summary: "High memory usage on {{ $labels.pod }}"
        description: "Memory usage is {{ $value | humanizePercentage }} on {{ $labels.pod }}"
    
    # Database connection pool exhausted
    - alert: DatabaseConnectionPoolExhausted
      expr: |
        pg_stat_database_numbackends / pg_settings_max_connections > 0.9
      for: 5m
      labels:
        severity: critical
      annotations:
        summary: "Database connection pool nearly exhausted"
        description: "{{ $value | humanizePercentage }} of connections in use"
    
    # Kafka consumer lag
    - alert: KafkaConsumerLag
      expr: |
        kafka_consumer_lag > 1000
      for: 10m
      labels:
        severity: warning
      annotations:
        summary: "High Kafka consumer lag"
        description: "Consumer lag is {{ $value }} messages on {{ $labels.topic }}"
    
    # Circuit breaker open
    - alert: CircuitBreakerOpen
      expr: |
        circuit_breaker_state == 1
      for: 5m
      labels:
        severity: warning
      annotations:
        summary: "Circuit breaker open"
        description: "Circuit breaker is open for {{ $labels.service }}"
```

Apply alert rules:

```bash
kubectl apply -f observability/prometheus/alert-rules/
```

### AlertManager Configuration

Configure routing and receivers:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: alertmanager-config
  namespace: monitoring
data:
  alertmanager.yml: |
    global:
      resolve_timeout: 5m
    
    route:
      group_by: ['alertname', 'cluster', 'service']
      group_wait: 10s
      group_interval: 10s
      repeat_interval: 12h
      receiver: 'pagerduty'
      routes:
      - match:
          severity: critical
        receiver: 'pagerduty'
        continue: true
      - match:
          severity: warning
        receiver: 'slack'
    
    receivers:
    - name: 'pagerduty'
      pagerduty_configs:
      - service_key: '<pagerduty-integration-key>'
        description: '{{ .CommonAnnotations.summary }}'
    
    - name: 'slack'
      slack_configs:
      - api_url: '<slack-webhook-url>'
        channel: '#alerts'
        title: '{{ .CommonAnnotations.summary }}'
        text: '{{ .CommonAnnotations.description }}'
    
    - name: 'email'
      email_configs:
      - to: 'ops@commercesphere.com'
        from: 'alerts@commercesphere.com'
        smarthost: 'smtp.gmail.com:587'
        auth_username: 'alerts@commercesphere.com'
        auth_password: '<password>'
```

### Accessing AlertManager

```bash
# Port forward to AlertManager
kubectl port-forward -n monitoring svc/prometheus-kube-prometheus-alertmanager 9093:9093

# Open http://localhost:9093
```

### Silencing Alerts

During maintenance windows:

1. Navigate to AlertManager UI
2. Click "New Silence"
3. Set matchers (e.g., `service=product-service`)
4. Set duration
5. Add comment
6. Click "Create"

## PagerDuty Integration

### Setup

1. **Create PagerDuty Service:**
   - Navigate to Services → Service Directory
   - Click "New Service"
   - Name: "CommerceSphere Production"
   - Integration: Prometheus

2. **Get Integration Key:**
   - Copy the integration key

3. **Configure AlertManager:**
   - Update AlertManager config with integration key
   - Apply configuration

### On-Call Schedule

Configure rotation in PagerDuty:
- Primary: 24/7 rotation, 1 week shifts
- Secondary: Backup, same schedule
- Escalation: Team lead after 15 minutes

### Incident Response

When paged:
1. Acknowledge alert in PagerDuty
2. Check Grafana dashboards
3. Check logs in Kibana
4. Follow runbook procedures
5. Resolve incident
6. Write postmortem

## Health Checks

### Liveness Probes

Check if service is alive:

```yaml
livenessProbe:
  httpGet:
    path: /health
    port: 3000
  initialDelaySeconds: 30
  periodSeconds: 10
  timeoutSeconds: 5
  failureThreshold: 3
```

### Readiness Probes

Check if service is ready to receive traffic:

```yaml
readinessProbe:
  httpGet:
    path: /ready
    port: 3000
  initialDelaySeconds: 5
  periodSeconds: 5
  timeoutSeconds: 3
  failureThreshold: 3
```

### Health Check Endpoints

**`/health`** - Basic health check:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

**`/ready`** - Readiness check (includes dependencies):
```json
{
  "status": "ready",
  "checks": {
    "database": "healthy",
    "redis": "healthy",
    "kafka": "healthy"
  },
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

## Synthetic Monitoring

### Uptime Checks

Use external monitoring service (e.g., Pingdom, UptimeRobot):
- Check API Gateway health endpoint every 1 minute
- Alert if down for 2 consecutive checks
- Check from multiple locations

### Smoke Tests

Run automated smoke tests after deployments:

```bash
kubectl apply -f kubernetes/jobs/smoke-tests.yaml
```

Smoke test script:
```bash
#!/bin/bash

# Test auth service
curl -f https://api.commercesphere.com/auth/health || exit 1

# Test product service
curl -f https://api.commercesphere.com/products/health || exit 1

# Test order service
curl -f https://api.commercesphere.com/orders/health || exit 1

# Test end-to-end flow
# Register user
# Login
# Create order
# Verify order created

echo "All smoke tests passed"
```

## Performance Monitoring

### Application Performance Monitoring (APM)

Consider using commercial APM solutions:
- **New Relic:** Full-stack observability
- **Datadog:** Infrastructure and application monitoring
- **Dynatrace:** AI-powered monitoring

### Real User Monitoring (RUM)

Track frontend performance:
- Page load time
- Time to interactive
- API response times
- Error rates

## Cost Optimization

### Metrics Retention

- **High-resolution (15s):** 7 days
- **Medium-resolution (1m):** 30 days
- **Low-resolution (5m):** 1 year

### Log Retention

- **Hot tier:** 7 days (fast queries)
- **Warm tier:** 30 days (slower queries)
- **Cold tier:** 90 days (archive)
- **Delete:** After 90 days

### Sampling

For high-traffic services, use sampling:
- Trace sampling: 10% of requests
- Log sampling: 50% of INFO logs, 100% of ERROR logs

## Best Practices

1. **Use Correlation IDs:** Track requests across services
2. **Structured Logging:** Use JSON format for easy parsing
3. **Meaningful Metrics:** Track business metrics, not just technical
4. **Alert on Symptoms:** Alert on user-facing issues, not causes
5. **Reduce Alert Fatigue:** Tune thresholds to minimize false positives
6. **Document Runbooks:** Link alerts to runbook procedures
7. **Regular Reviews:** Review dashboards and alerts monthly
8. **Test Alerts:** Regularly test alert routing and escalation

## Troubleshooting

### Metrics Not Appearing

```bash
# Check ServiceMonitor
kubectl get servicemonitor -n monitoring

# Check Prometheus targets
# Open Prometheus UI → Status → Targets

# Check service metrics endpoint
kubectl port-forward svc/product-service 3000:80 -n commercesphere
curl http://localhost:3000/metrics
```

### Logs Not Appearing

```bash
# Check Filebeat
kubectl get pods -n logging -l app=filebeat

# Check Filebeat logs
kubectl logs -n logging -l app=filebeat

# Check Logstash
kubectl logs -n logging -l app=logstash

# Check Elasticsearch indices
curl http://localhost:9200/_cat/indices?v
```

### Alerts Not Firing

```bash
# Check alert rules
kubectl get prometheusrule -n monitoring

# Check AlertManager
# Open AlertManager UI → Status

# Test alert
# Manually trigger condition and verify alert fires
```

## Support

For monitoring and alerting support:
- **Documentation:** https://docs.commercesphere.com/monitoring
- **Slack:** #observability
- **Email:** observability@commercesphere.com
