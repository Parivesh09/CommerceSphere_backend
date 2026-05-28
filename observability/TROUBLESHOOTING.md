# Observability Troubleshooting Guide

This guide helps diagnose and fix common observability issues.

## Quick Diagnostics

Run the verification script first:
```bash
./observability/verify-setup.sh
```

## Issue Categories

- [Observability Stack Issues](#observability-stack-issues)
- [Metrics Issues](#metrics-issues)
- [Logging Issues](#logging-issues)
- [Tracing Issues](#tracing-issues)
- [Performance Issues](#performance-issues)

---

## Observability Stack Issues

### Prometheus Not Starting

**Symptoms**:
- Container exits immediately
- Port 9090 not accessible

**Diagnosis**:
```bash
docker logs prometheus
```

**Common Causes**:

1. **Invalid Configuration**
   ```bash
   # Validate config
   docker exec prometheus promtool check config /etc/prometheus/prometheus.yml
   ```
   **Fix**: Correct syntax errors in `observability/prometheus/prometheus.yml`

2. **Port Already in Use**
   ```bash
   lsof -i :9090
   ```
   **Fix**: Stop conflicting process or change Prometheus port

3. **Permission Issues**
   ```bash
   docker logs prometheus | grep permission
   ```
   **Fix**: Check volume mount permissions

### Grafana Not Accessible

**Symptoms**:
- Cannot access http://localhost:3001
- Login page not loading

**Diagnosis**:
```bash
docker logs grafana
curl http://localhost:3001/api/health
```

**Common Causes**:

1. **Container Not Running**
   ```bash
   docker-compose -f docker-compose.observability.yml ps grafana
   ```
   **Fix**: Start Grafana
   ```bash
   docker-compose -f docker-compose.observability.yml up -d grafana
   ```

2. **Prometheus Data Source Not Connected**
   - Open Grafana → Configuration → Data Sources
   - Test Prometheus connection
   **Fix**: Update data source URL to `http://prometheus:9090`

### Elasticsearch Not Starting

**Symptoms**:
- Container restarts repeatedly
- Port 9200 not accessible

**Diagnosis**:
```bash
docker logs elasticsearch
```

**Common Causes**:

1. **Insufficient Memory**
   ```bash
   docker logs elasticsearch | grep "memory"
   ```
   **Fix**: Increase Docker memory limit or reduce ES heap size
   ```yaml
   # In docker-compose.observability.yml
   environment:
     - "ES_JAVA_OPTS=-Xms256m -Xmx256m"  # Reduce if needed
   ```

2. **vm.max_map_count Too Low**
   ```bash
   sysctl vm.max_map_count
   ```
   **Fix**: Increase vm.max_map_count
   ```bash
   # Linux
   sudo sysctl -w vm.max_map_count=262144
   
   # macOS (Docker Desktop)
   # Settings → Resources → Advanced → Memory
   ```

### Kibana Not Loading

**Symptoms**:
- Kibana UI not accessible
- "Kibana server is not ready yet"

**Diagnosis**:
```bash
docker logs kibana
curl http://localhost:5601/api/status
```

**Common Causes**:

1. **Elasticsearch Not Ready**
   ```bash
   curl http://localhost:9200/_cluster/health
   ```
   **Fix**: Wait for Elasticsearch to be healthy (yellow or green)

2. **Index Pattern Not Created**
   - Open Kibana → Management → Index Patterns
   **Fix**: Create index pattern `commercesphere-logs-*`

---

## Metrics Issues

### Service Metrics Not Appearing in Prometheus

**Symptoms**:
- Service not in Prometheus targets
- Metrics queries return no data

**Diagnosis**:
```bash
# Check Prometheus targets
curl http://localhost:9090/api/v1/targets | jq '.data.activeTargets[] | select(.labels.job=="your-service")'

# Check service metrics endpoint
curl http://your-service:3000/metrics
```

**Common Causes**:

1. **Service Not in Prometheus Config**
   ```bash
   docker exec prometheus cat /etc/prometheus/prometheus.yml | grep your-service
   ```
   **Fix**: Add service to `observability/prometheus/prometheus.yml`
   ```yaml
   scrape_configs:
     - job_name: 'your-service'
       static_configs:
         - targets: ['your-service:3000']
   ```
   Then reload Prometheus:
   ```bash
   docker-compose -f docker-compose.observability.yml restart prometheus
   ```

2. **Metrics Endpoint Not Accessible**
   ```bash
   # From Prometheus container
   docker exec prometheus wget -O- http://your-service:3000/metrics
   ```
   **Fix**: 
   - Ensure service is running
   - Check network connectivity
   - Verify `/metrics` endpoint exists

3. **Metrics Not Initialized**
   ```typescript

   const metrics = initializeMetrics({ serviceName: 'your-service' });
   ```

### Metrics Endpoint Returns 500

**Symptoms**:
- `/metrics` endpoint returns error
- Prometheus shows target as down

**Diagnosis**:
```bash
curl -v http://localhost:3000/metrics
```

**Common Causes**:

1. **Metrics Not Initialized**
   ```typescript

   app.use(metricsMiddleware());  // ❌ Metrics not initialized yet
   const metrics = initializeMetrics({ serviceName });
   

   const metrics = initializeMetrics({ serviceName });  // ✅ Initialize first
   app.use(metricsMiddleware());
   ```

2. **Registry Error**
   Check service logs for errors related to prom-client

### High Cardinality Metrics

**Symptoms**:
- Prometheus using excessive memory
- Slow query performance
- "too many samples" errors

**Diagnosis**:
```bash
# Check cardinality
curl http://localhost:9090/api/v1/status/tsdb | jq '.data.seriesCountByMetricName'
```

**Fix**:
- Reduce number of unique label combinations
- Don't use user IDs or request IDs as labels
- Use fixed label values (e.g., status: success/failure, not status: 200/201/404/500)

```typescript

counter.inc({ user_id: userId, request_id: requestId });


counter.inc({ status: 'success', endpoint: '/api/orders' });
```

---

## Logging Issues

### Logs Not Appearing in Kibana

**Symptoms**:
- No logs in Kibana Discover
- Empty search results

**Diagnosis**:
```bash
# Check Elasticsearch indices
curl http://localhost:9200/_cat/indices/commercesphere-logs-*

# Check Logstash is receiving logs
docker logs logstash | tail -20

# Check service is logging
docker logs your-service | head -20
```

**Common Causes**:

1. **No Index Pattern in Kibana**
   - Open Kibana → Management → Index Patterns
   **Fix**: Create index pattern `commercesphere-logs-*`

2. **Logs Not in JSON Format**
   ```bash
   # Check log format
   docker logs your-service | head -1
   ```
   **Fix**: Ensure logger outputs JSON
   ```typescript
   const logger = createLogger({
     serviceName: 'your-service',

   });
   ```

3. **Logstash Not Running**
   ```bash
   docker-compose -f docker-compose.observability.yml ps logstash
   ```
   **Fix**: Start Logstash
   ```bash
   docker-compose -f docker-compose.observability.yml up -d logstash
   ```

4. **Logs Not Sent to Logstash**
   - By default, services log to stdout
   - Logstash ingestion requires additional configuration
   **Fix**: For now, logs are in Docker logs. To send to Logstash, add transport:
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

### Correlation IDs Missing from Logs

**Symptoms**:
- Logs don't have `correlationId` field
- Cannot trace requests across services

**Diagnosis**:
```bash
# Check logs for correlationId
docker logs your-service | grep correlationId
```

**Common Causes**:

1. **Correlation Middleware Not Applied**
   ```typescript

   app.use(correlationMiddleware());
   app.use(requestLoggingMiddleware(logger));
   ```

2. **Middleware Order Wrong**
   ```typescript

   app.use(requestLoggingMiddleware(logger));  // ❌
   app.use(correlationMiddleware());
   

   app.use(correlationMiddleware());  // ✅ First
   app.use(requestLoggingMiddleware(logger));
   ```

### Log Volume Too High

**Symptoms**:
- Elasticsearch disk full
- Slow log queries
- High I/O usage

**Diagnosis**:
```bash
# Check index sizes
curl http://localhost:9200/_cat/indices/commercesphere-logs-*?v

# Check log rate
docker logs your-service | wc -l
```

**Fix**:

1. **Reduce Log Level**
   ```typescript
   const logger = createLogger({
     serviceName: 'your-service',
     level: 'info',  // Change from 'debug' to 'info'
   });
   ```

2. **Implement Log Sampling**
   ```typescript

   if (statusCode >= 200 && statusCode < 300) {
     if (Math.random() < 0.1) {
       logger.info('Request completed', { ... });
     }
   } else {

     logger.error('Request failed', { ... });
   }
   ```

3. **Set Up Index Lifecycle Management**
   ```bash
   # Delete old indices
   curl -X DELETE http://localhost:9200/commercesphere-logs-2024.01.*
   ```

---

## Tracing Issues

### Traces Not Appearing in Jaeger

**Symptoms**:
- No traces in Jaeger UI
- Service not in service dropdown

**Diagnosis**:
```bash
# Check Jaeger is running
curl http://localhost:16686/

# Check service logs for trace errors
docker logs your-service | grep -i trace
```

**Common Causes**:

1. **Tracer Not Initialized**
   ```typescript
   const tracer = initializeTracer('your-service');
   ```

2. **Spans Not Finished**
   ```typescript
   const span = tracer.startSpan('operation');
   try {

   } finally {
     span.finish();  // ✅ Always finish spans
   }
   ```

3. **Trace Context Not Propagated**
   ```typescript

   const tracer = getTracer();
   const headers = tracer.inject({
     'Content-Type': 'application/json',
   });
   await axios.post('http://downstream-service/api', data, { headers });
   ```

### Incomplete Traces

**Symptoms**:
- Traces missing spans
- Broken trace chains

**Diagnosis**:
- Check Jaeger UI for incomplete traces
- Look for missing parent-child relationships

**Fix**:
- Ensure all services propagate trace context
- Verify spans are created for all significant operations
- Check that parent span context is passed to child spans

---

## Performance Issues

### High Memory Usage

**Symptoms**:
- Service memory grows over time
- Out of memory errors

**Diagnosis**:
```bash
# Check memory usage
docker stats your-service

# Check for memory leaks
node --inspect your-service
# Use Chrome DevTools to profile
```

**Common Causes**:

1. **Metric Cardinality Too High**
   - See [High Cardinality Metrics](#high-cardinality-metrics)

2. **Spans Not Finished**
   ```typescript

   const span = tracer.startSpan('operation');
   try {

   } finally {
     span.finish();  // Prevents memory leak
   }
   ```

3. **Log Buffering**
   - Logs buffered in memory before writing
   **Fix**: Use async file transport or reduce buffer size

### High CPU Usage

**Symptoms**:
- Service CPU usage consistently high
- Slow response times

**Diagnosis**:
```bash
# Check CPU usage
docker stats your-service

# Profile CPU
node --prof your-service
node --prof-process isolate-*.log
```

**Common Causes**:

1. **Excessive Logging**
   - Reduce log level
   - Implement log sampling

2. **Metrics Collection Overhead**
   - Reduce metric cardinality
   - Increase scrape interval

3. **Synchronous Operations**
   - Use async logging
   - Don't block on metric collection

### Slow Response Times

**Symptoms**:
- Increased latency after adding observability
- P95/P99 latency higher than expected

**Diagnosis**:
```bash
# Check latency metrics
curl http://localhost:9090/api/v1/query?query=histogram_quantile(0.95,rate(http_request_duration_seconds_bucket[5m]))
```

**Fix**:

1. **Optimize Logging**
   ```typescript

   logger.info('Order created', {
     orderId,  // ✅ Just the ID

   });
   ```

2. **Reduce Tracing Overhead**
   ```typescript


   ```

3. **Use Async Operations**
   ```typescript

   const logger = createLogger({
     serviceName: 'your-service',
     enableFile: true,

   });
   ```

---

## Getting Help

### Collect Diagnostic Information

```bash
# Save all logs
docker-compose -f docker-compose.observability.yml logs > observability-logs.txt

# Save service logs
docker logs your-service > service-logs.txt

# Save Prometheus config
docker exec prometheus cat /etc/prometheus/prometheus.yml > prometheus-config.yml

# Save metrics
curl http://localhost:3000/metrics > service-metrics.txt

# Save Prometheus targets
curl http://localhost:9090/api/v1/targets > prometheus-targets.json
```

### Check Documentation

- [Observability README](./README.md)
- [Setup Guide](./SETUP_GUIDE.md)
- [Quick Reference](./QUICK_REFERENCE.md)
- [Integration Checklist](./INTEGRATION_CHECKLIST.md)

### Report Issues

When reporting issues, include:
1. Symptoms and error messages
2. Diagnostic information (logs, configs)
3. Steps to reproduce
4. Expected vs actual behavior
5. Environment details (OS, Docker version, etc.)

---

## Prevention

### Best Practices

1. **Always Test Locally First**
   - Run observability stack locally
   - Verify metrics, logs, traces
   - Load test before deploying

2. **Monitor Observability Health**
   - Set up alerts for Prometheus/Elasticsearch
   - Monitor disk usage
   - Track metric cardinality

3. **Regular Maintenance**
   - Clean up old logs/metrics
   - Update observability stack
   - Review and optimize queries

4. **Documentation**
   - Document custom metrics
   - Keep runbooks updated
   - Share knowledge with team

### Health Checks

Add these to your monitoring:

```promql
# Prometheus is scraping successfully
up{job="your-service"} == 1

# Elasticsearch is healthy
elasticsearch_cluster_health_status{color="green"} == 1

# Logstash is processing logs
logstash_events_in > 0

# Jaeger is receiving traces
jaeger_collector_spans_received_total > 0
```
