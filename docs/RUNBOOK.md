# Operations Runbook

## Overview

This runbook provides step-by-step procedures for common operational tasks, incident response, and troubleshooting for CommerceSphere.

## Table of Contents

1. [Service Health Checks](#service-health-checks)
2. [Incident Response](#incident-response)
3. [Common Issues](#common-issues)
4. [Deployment Operations](#deployment-operations)
5. [Database Operations](#database-operations)
6. [Scaling Operations](#scaling-operations)
7. [Backup and Recovery](#backup-and-recovery)
8. [Monitoring and Alerts](#monitoring-and-alerts)
9. [Security Incidents](#security-incidents)
10. [Maintenance Windows](#maintenance-windows)

---

## Service Health Checks

### Quick Health Check

```bash
# Check all services
kubectl get pods -n commercesphere

# Check specific service
kubectl get pods -l app=product-service -n commercesphere

# Check service endpoints
curl https://api.commercesphere.com/auth/health
curl https://api.commercesphere.com/products/health
curl https://api.commercesphere.com/orders/health
```

### Detailed Health Check

```bash
# Check deployment status
kubectl get deployments -n commercesphere

# Check HPA status
kubectl get hpa -n commercesphere

# Check service endpoints
kubectl get endpoints -n commercesphere

# Check ingress
kubectl get ingress -n commercesphere
```

### Infrastructure Health

```bash
# PostgreSQL
kubectl exec -it postgres-0 -n commercesphere -- pg_isready

# Redis
kubectl exec -it redis-0 -n commercesphere -- redis-cli ping

# Kafka
kubectl exec -it kafka-0 -n commercesphere -- \
  kafka-broker-api-versions --bootstrap-server localhost:9092

# Elasticsearch
curl http://elasticsearch-service:9200/_cluster/health
```

---

## Incident Response

### Severity Levels

- **P0 (Critical):** Complete service outage, data loss
- **P1 (High):** Major functionality impaired, significant user impact
- **P2 (Medium):** Partial functionality impaired, some users affected
- **P3 (Low):** Minor issues, minimal user impact

### P0: Complete Service Outage

#### Symptoms
- All services returning 5xx errors
- No pods running
- Database unavailable

#### Response Steps

1. **Acknowledge Alert**
   ```bash
   # Check overall status
   kubectl get pods -n commercesphere
   kubectl get nodes
   ```

2. **Identify Root Cause**
   ```bash
   # Check recent events
   kubectl get events -n commercesphere --sort-by='.lastTimestamp'
   
   # Check pod logs
   kubectl logs -l app=<service-name> -n commercesphere --tail=100
   ```

3. **Quick Fixes**
   
   **If pods are crashing:**
   ```bash
   # Check pod status
   kubectl describe pod <pod-name> -n commercesphere
   
   # Restart deployment
   kubectl rollout restart deployment/<service-name> -n commercesphere
   ```
   
   **If database is down:**
   ```bash
   # Check database pod
   kubectl get pods -l app=postgres -n commercesphere
   
   # Restart database
   kubectl delete pod postgres-0 -n commercesphere
   ```
   
   **If ingress is down:**
   ```bash
   # Check ingress controller
   kubectl get pods -n ingress-nginx
   
   # Restart ingress
   kubectl rollout restart deployment/nginx-ingress-controller -n ingress-nginx
   ```

4. **Rollback if Recent Deployment**
   ```bash
   # Check rollout history
   kubectl rollout history deployment/<service-name> -n commercesphere
   
   # Rollback
   kubectl rollout undo deployment/<service-name> -n commercesphere
   ```

5. **Communicate**
   - Update status page
   - Notify stakeholders
   - Post in #incidents Slack channel

6. **Monitor Recovery**
   ```bash
   # Watch pod status
   kubectl get pods -n commercesphere -w
   
   # Check service health
   watch -n 5 'curl -s https://api.commercesphere.com/health'
   ```

### P1: Service Degradation

#### Symptoms
- High error rate (>5%)
- Slow response times (>2s p99)
- Some features unavailable

#### Response Steps

1. **Identify Affected Service**
   ```bash
   # Check error rates in Grafana
   # Open: https://grafana.commercesphere.com
   
   # Check logs for errors
   kubectl logs -l app=<service-name> -n commercesphere --tail=100 | grep ERROR
   ```

2. **Check Resource Usage**
   ```bash
   # Check CPU/Memory
   kubectl top pods -n commercesphere
   
   # Check if pods are being throttled
   kubectl describe pod <pod-name> -n commercesphere | grep -A 5 "State"
   ```

3. **Scale if Needed**
   ```bash
   # Manual scale up
   kubectl scale deployment/<service-name> --replicas=10 -n commercesphere
   ```

4. **Check Dependencies**
   ```bash
   # Check database connections
   kubectl exec -it <pod-name> -n commercesphere -- \
     psql -h postgres-service -U commercesphere -c "SELECT count(*) FROM pg_stat_activity;"
   
   # Check Redis
   kubectl exec -it redis-0 -n commercesphere -- redis-cli INFO stats
   
   # Check Kafka lag
   kubectl exec -it kafka-0 -n commercesphere -- \
     kafka-consumer-groups --bootstrap-server localhost:9092 --describe --all-groups
   ```

5. **Restart if Necessary**
   ```bash
   kubectl rollout restart deployment/<service-name> -n commercesphere
   ```

### P2: Partial Functionality Impaired

#### Symptoms
- Specific feature not working
- Intermittent errors
- Slow performance for some operations

#### Response Steps

1. **Identify Scope**
   - Which feature is affected?
   - How many users impacted?
   - Is it consistent or intermittent?

2. **Check Logs**
   ```bash
   # Filter logs for specific feature
   kubectl logs -l app=<service-name> -n commercesphere | grep "<feature-name>"
   ```

3. **Check Configuration**
   ```bash
   # Check ConfigMaps
   kubectl get configmap -n commercesphere
   kubectl describe configmap service-config -n commercesphere
   
   # Check Secrets
   kubectl get secrets -n commercesphere
   ```

4. **Test Manually**
   ```bash
   # Port forward to service
   kubectl port-forward svc/<service-name> 8080:80 -n commercesphere
   
   # Test endpoint
   curl http://localhost:8080/<endpoint>
   ```

---

## Common Issues

### Issue: High CPU Usage

#### Symptoms
- CPU usage >80%
- Slow response times
- HPA scaling up

#### Diagnosis
```bash
# Check CPU usage
kubectl top pods -n commercesphere

# Check which processes are using CPU
kubectl exec -it <pod-name> -n commercesphere -- top
```

#### Resolution
```bash
# Scale up manually
kubectl scale deployment/<service-name> --replicas=10 -n commercesphere

# Or adjust HPA
kubectl patch hpa <service-name>-hpa -n commercesphere \
  -p '{"spec":{"maxReplicas":15}}'

# Check for inefficient code
kubectl logs <pod-name> -n commercesphere | grep "slow query"
```

### Issue: High Memory Usage

#### Symptoms
- Memory usage >80%
- OOMKilled pods
- Pods restarting frequently

#### Diagnosis
```bash
# Check memory usage
kubectl top pods -n commercesphere

# Check pod events
kubectl describe pod <pod-name> -n commercesphere | grep -A 10 "Events"
```

#### Resolution
```bash
# Increase memory limits
kubectl set resources deployment/<service-name> \
  --limits=memory=2Gi \
  --requests=memory=1Gi \
  -n commercesphere

# Check for memory leaks
kubectl logs <pod-name> -n commercesphere | grep "heap"
```

### Issue: Database Connection Pool Exhausted

#### Symptoms
- "Too many connections" errors
- Slow database queries
- Connection timeouts

#### Diagnosis
```bash
# Check active connections
kubectl exec -it postgres-0 -n commercesphere -- \
  psql -U commercesphere -c "SELECT count(*) FROM pg_stat_activity;"

# Check connection limits
kubectl exec -it postgres-0 -n commercesphere -- \
  psql -U commercesphere -c "SHOW max_connections;"
```

#### Resolution
```bash
# Increase connection limit (temporary)
kubectl exec -it postgres-0 -n commercesphere -- \
  psql -U commercesphere -c "ALTER SYSTEM SET max_connections = 200;"

# Restart PostgreSQL
kubectl delete pod postgres-0 -n commercesphere

# Or scale down services temporarily
kubectl scale deployment/<service-name> --replicas=2 -n commercesphere
```

### Issue: Kafka Consumer Lag

#### Symptoms
- Events not being processed
- Increasing lag in consumer groups
- Delayed notifications

#### Diagnosis
```bash
# Check consumer lag
kubectl exec -it kafka-0 -n commercesphere -- \
  kafka-consumer-groups --bootstrap-server localhost:9092 \
  --describe --group <consumer-group>
```

#### Resolution
```bash
# Scale up consumers
kubectl scale deployment/<consumer-service> --replicas=5 -n commercesphere

# Check for stuck consumers
kubectl logs -l app=<consumer-service> -n commercesphere | grep "ERROR"

# Restart consumers
kubectl rollout restart deployment/<consumer-service> -n commercesphere
```

### Issue: Circuit Breaker Open

#### Symptoms
- Fallback responses being returned
- Alerts for circuit breaker open
- Downstream service failures

#### Diagnosis
```bash
# Check circuit breaker status in logs
kubectl logs -l app=<service-name> -n commercesphere | grep "circuit"

# Check downstream service health
kubectl get pods -l app=<downstream-service> -n commercesphere
```

#### Resolution
```bash
# Fix downstream service
kubectl rollout restart deployment/<downstream-service> -n commercesphere

# Circuit breaker will auto-close after successful requests
# Monitor in Grafana dashboard
```

### Issue: SSL Certificate Expired

#### Symptoms
- HTTPS errors
- Certificate warnings
- API Gateway returning 502

#### Diagnosis
```bash
# Check certificate expiration
kubectl get certificate -n commercesphere

# Check cert-manager logs
kubectl logs -n cert-manager deployment/cert-manager
```

#### Resolution
```bash
# Force certificate renewal
kubectl delete secret commercesphere-tls -n commercesphere
kubectl delete certificaterequest --all -n commercesphere

# Cert-manager will automatically request new certificate
# Monitor progress
kubectl get certificate -n commercesphere -w
```

---

## Deployment Operations

### Standard Deployment

```bash
# 1. Build and push images
docker build -t commercesphere/product-service:v1.2.0 services/product
docker push commercesphere/product-service:v1.2.0

# 2. Update deployment
kubectl set image deployment/product-service \
  product-service=commercesphere/product-service:v1.2.0 \
  -n commercesphere

# 3. Monitor rollout
kubectl rollout status deployment/product-service -n commercesphere

# 4. Verify health
curl https://api.commercesphere.com/products/health

# 5. Run smoke tests
kubectl apply -f kubernetes/jobs/smoke-tests.yaml
```

### Rollback Deployment

```bash
# Check rollout history
kubectl rollout history deployment/product-service -n commercesphere

# Rollback to previous version
kubectl rollout undo deployment/product-service -n commercesphere

# Rollback to specific revision
kubectl rollout undo deployment/product-service \
  --to-revision=3 \
  -n commercesphere

# Monitor rollback
kubectl rollout status deployment/product-service -n commercesphere
```

### Canary Deployment

```bash
# 1. Deploy canary
kubectl apply -f kubernetes/deployments/product-service-canary.yaml

# 2. Configure traffic split (10% to canary)
kubectl apply -f kubernetes/traffic-split-10.yaml

# 3. Monitor metrics for 30 minutes
# Check Grafana dashboard

# 4. If successful, increase traffic
kubectl apply -f kubernetes/traffic-split-50.yaml

# 5. If still successful, promote canary
kubectl apply -f kubernetes/deployments/product-service-v2.yaml

# 6. Remove canary
kubectl delete -f kubernetes/deployments/product-service-canary.yaml
```

---

## Database Operations

### Backup Database

```bash
# Manual backup
kubectl exec -it postgres-0 -n commercesphere -- \
  pg_dump -U commercesphere auth_service > auth_service_backup.sql

# Or use backup job
kubectl create job --from=cronjob/db-backup db-backup-manual -n commercesphere

# Verify backup
kubectl logs job/db-backup-manual -n commercesphere
```

### Restore Database

```bash
# 1. Stop services using the database
kubectl scale deployment/auth-service --replicas=0 -n commercesphere

# 2. Restore database
kubectl exec -i postgres-0 -n commercesphere -- \
  psql -U commercesphere auth_service < auth_service_backup.sql

# 3. Verify data
kubectl exec -it postgres-0 -n commercesphere -- \
  psql -U commercesphere auth_service -c "SELECT count(*) FROM users;"

# 4. Restart services
kubectl scale deployment/auth-service --replicas=3 -n commercesphere
```

### Run Database Migration

```bash
# Create migration job
kubectl apply -f kubernetes/jobs/db-migration.yaml

# Monitor migration
kubectl logs -f job/db-migration -n commercesphere

# Verify migration
kubectl exec -it postgres-0 -n commercesphere -- \
  psql -U commercesphere auth_service -c "\dt"
```

### Optimize Database

```bash
# Vacuum and analyze
kubectl exec -it postgres-0 -n commercesphere -- \
  psql -U commercesphere auth_service -c "VACUUM ANALYZE;"

# Reindex
kubectl exec -it postgres-0 -n commercesphere -- \
  psql -U commercesphere auth_service -c "REINDEX DATABASE auth_service;"

# Check table sizes
kubectl exec -it postgres-0 -n commercesphere -- \
  psql -U commercesphere auth_service -c "
    SELECT schemaname, tablename, 
           pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
    FROM pg_tables
    WHERE schemaname = 'public'
    ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
  "
```

---

## Scaling Operations

### Manual Scaling

```bash
# Scale up
kubectl scale deployment/product-service --replicas=10 -n commercesphere

# Scale down
kubectl scale deployment/product-service --replicas=3 -n commercesphere

# Scale all services
for service in auth product order payment; do
  kubectl scale deployment/${service}-service --replicas=5 -n commercesphere
done
```

### Adjust HPA

```bash
# Increase max replicas
kubectl patch hpa product-service-hpa -n commercesphere \
  -p '{"spec":{"maxReplicas":20}}'

# Change CPU threshold
kubectl patch hpa product-service-hpa -n commercesphere \
  -p '{"spec":{"metrics":[{"type":"Resource","resource":{"name":"cpu","target":{"type":"Utilization","averageUtilization":60}}}]}}'
```

### Scale Infrastructure

```bash
# Scale PostgreSQL (if using StatefulSet)
kubectl scale statefulset postgres --replicas=3 -n commercesphere

# Scale Redis
kubectl scale statefulset redis --replicas=3 -n commercesphere

# Scale Kafka
kubectl scale statefulset kafka --replicas=5 -n commercesphere
```

---

## Backup and Recovery

### Full System Backup

```bash
# 1. Backup all databases
kubectl create job --from=cronjob/db-backup-all db-backup-full -n commercesphere

# 2. Backup Kubernetes resources
kubectl get all -n commercesphere -o yaml > k8s-backup.yaml

# 3. Backup ConfigMaps and Secrets
kubectl get configmaps -n commercesphere -o yaml > configmaps-backup.yaml
kubectl get secrets -n commercesphere -o yaml > secrets-backup.yaml

# 4. Upload to S3
aws s3 cp k8s-backup.yaml s3://commercesphere-backups/$(date +%Y%m%d)/
aws s3 cp configmaps-backup.yaml s3://commercesphere-backups/$(date +%Y%m%d)/
aws s3 cp secrets-backup.yaml s3://commercesphere-backups/$(date +%Y%m%d)/
```

### Disaster Recovery

```bash
# 1. Provision new cluster
# Follow deployment guide

# 2. Restore databases
kubectl apply -f kubernetes/jobs/db-restore.yaml

# 3. Restore Kubernetes resources
kubectl apply -f k8s-backup.yaml

# 4. Verify services
kubectl get pods -n commercesphere
kubectl get svc -n commercesphere

# 5. Run smoke tests
kubectl apply -f kubernetes/jobs/smoke-tests.yaml

# 6. Update DNS
# Point DNS to new cluster load balancer
```

---

## Monitoring and Alerts

### Check Prometheus Metrics

```bash
# Port forward to Prometheus
kubectl port-forward -n monitoring svc/prometheus-server 9090:80

# Open http://localhost:9090
# Query examples:
# - rate(http_requests_total[5m])
# - http_request_duration_seconds_bucket
# - up{job="product-service"}
```

### Check Grafana Dashboards

```bash
# Port forward to Grafana
kubectl port-forward -n monitoring svc/prometheus-grafana 3000:80

# Open http://localhost:3000
# Default credentials: admin/prom-operator
```

### Check Logs in Kibana

```bash
# Port forward to Kibana
kubectl port-forward -n logging svc/kibana 5601:5601

# Open http://localhost:5601
```

### Silence Alerts

```bash
# Port forward to AlertManager
kubectl port-forward -n monitoring svc/alertmanager 9093:9093

# Open http://localhost:9093
# Create silence for maintenance window
```

---

## Security Incidents

### Suspected Breach

1. **Isolate Affected Systems**
   ```bash
   # Scale down affected service
   kubectl scale deployment/<service-name> --replicas=0 -n commercesphere
   
   # Block traffic
   kubectl apply -f kubernetes/network-policies/deny-all.yaml
   ```

2. **Collect Evidence**
   ```bash
   # Export logs
   kubectl logs -l app=<service-name> -n commercesphere > incident-logs.txt
   
   # Export pod description
   kubectl describe pod <pod-name> -n commercesphere > pod-description.txt
   ```

3. **Notify Security Team**
   - Email: security@commercesphere.com
   - Slack: #security-incidents

4. **Rotate Credentials**
   ```bash
   # Rotate JWT secret
   kubectl create secret generic api-keys \
     --from-literal=jwt-secret='<new-secret>' \
     --dry-run=client -o yaml | kubectl apply -f -
   
   # Restart services to pick up new secret
   kubectl rollout restart deployment/auth-service -n commercesphere
   ```

### Suspicious Activity

1. **Check Access Logs**
   ```bash
   kubectl logs -l app=gateway -n commercesphere | grep "401\|403"
   ```

2. **Check Failed Login Attempts**
   ```bash
   kubectl logs -l app=auth-service -n commercesphere | grep "login failed"
   ```

3. **Block IP if Necessary**
   ```bash
   # Add to rate limiter blacklist
   kubectl exec -it redis-0 -n commercesphere -- \
     redis-cli SADD blocked_ips "192.168.1.100"
   ```

---

## Maintenance Windows

### Planned Maintenance Procedure

1. **Schedule Maintenance**
   - Notify users 48 hours in advance
   - Update status page
   - Post in #announcements

2. **Pre-Maintenance Checklist**
   - [ ] Backup all databases
   - [ ] Backup Kubernetes resources
   - [ ] Test rollback procedure
   - [ ] Prepare runbook
   - [ ] Notify on-call team

3. **During Maintenance**
   ```bash
   # Enable maintenance mode
   kubectl apply -f kubernetes/maintenance-mode.yaml
   
   # Perform updates
   # ...
   
   # Disable maintenance mode
   kubectl delete -f kubernetes/maintenance-mode.yaml
   ```

4. **Post-Maintenance Checklist**
   - [ ] Run smoke tests
   - [ ] Verify all services healthy
   - [ ] Check error rates
   - [ ] Update status page
   - [ ] Send completion notification

### Zero-Downtime Maintenance

```bash
# Use rolling updates
kubectl set image deployment/<service-name> \
  <container-name>=<new-image> \
  -n commercesphere

# Monitor rollout
kubectl rollout status deployment/<service-name> -n commercesphere
```

---

## Contact Information

### On-Call Rotation

- **Primary:** Check PagerDuty schedule
- **Secondary:** Check PagerDuty schedule
- **Escalation:** Team Lead

### Emergency Contacts

- **Operations:** ops@commercesphere.com
- **Security:** security@commercesphere.com
- **Engineering:** engineering@commercesphere.com
- **Management:** management@commercesphere.com

### Slack Channels

- **#incidents** - Active incidents
- **#ops** - Operations discussions
- **#alerts** - Automated alerts
- **#deployments** - Deployment notifications

---

## Appendix

### Useful Commands Cheat Sheet

```bash
# Get all resources
kubectl get all -n commercesphere

# Describe resource
kubectl describe <resource-type> <resource-name> -n commercesphere

# View logs
kubectl logs <pod-name> -n commercesphere

# Follow logs
kubectl logs -f <pod-name> -n commercesphere

# Execute command in pod
kubectl exec -it <pod-name> -n commercesphere -- /bin/sh

# Port forward
kubectl port-forward svc/<service-name> 8080:80 -n commercesphere

# Copy files
kubectl cp <pod-name>:/path/to/file ./local-file -n commercesphere

# Get events
kubectl get events -n commercesphere --sort-by='.lastTimestamp'

# Top pods
kubectl top pods -n commercesphere

# Top nodes
kubectl top nodes
```

### Log Levels

- **DEBUG:** Detailed diagnostic information
- **INFO:** General informational messages
- **WARN:** Warning messages, potential issues
- **ERROR:** Error messages, requires attention
- **FATAL:** Critical errors, service failure

### Metric Thresholds

| Metric | Warning | Critical |
|--------|---------|----------|
| CPU Usage | >70% | >90% |
| Memory Usage | >75% | >90% |
| Error Rate | >2% | >5% |
| Response Time (p99) | >1s | >2s |
| Database Connections | >80% | >95% |
| Disk Usage | >80% | >90% |

### Escalation Matrix

| Severity | Response Time | Escalation Time |
|----------|---------------|-----------------|
| P0 | Immediate | 15 minutes |
| P1 | 15 minutes | 30 minutes |
| P2 | 1 hour | 2 hours |
| P3 | 4 hours | 8 hours |
