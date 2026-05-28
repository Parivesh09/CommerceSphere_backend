# Deployment Guide

## Overview

This guide covers deploying CommerceSphere to production using Kubernetes. The platform supports multiple deployment strategies including rolling updates, canary deployments, and blue-green deployments.

## Prerequisites

### Infrastructure Requirements

- **Kubernetes Cluster:** v1.28+ with at least 3 worker nodes
- **Node Resources:** Minimum 4 CPU cores and 16GB RAM per node
- **Storage:** Persistent volume support (100GB+ recommended)
- **Load Balancer:** Cloud provider load balancer or Nginx Ingress
- **Container Registry:** Docker Hub, AWS ECR, Google GCR, or Azure ACR

### Tools Required

- `kubectl` v1.28+
- `helm` v3.12+
- `docker` v24+
- `make` (for automation scripts)

### Access Requirements

- Kubernetes cluster admin access
- Container registry push access
- DNS management access
- SSL certificate management

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│              Load Balancer / Ingress                │
└────────────────────┬────────────────────────────────┘
                     │
        ┌────────────┼────────────┐
        │            │            │
        ▼            ▼            ▼
┌──────────────┬──────────────┬──────────────┐
│  API Gateway │  Services    │  Services    │
│  (3 replicas)│  (3+ each)   │  (3+ each)   │
└──────┬───────┴──────┬───────┴──────┬───────┘
       │              │              │
       └──────┬───────┴──────┬───────┘
              │              │
              ▼              ▼
┌─────────────────────────────────────────────┐
│         Stateful Services                   │
│  PostgreSQL | Redis | Kafka | Elasticsearch│
└─────────────────────────────────────────────┘
```

## Pre-Deployment Checklist

- [ ] Kubernetes cluster provisioned and accessible
- [ ] Container images built and pushed to registry
- [ ] Database instances provisioned (or using in-cluster)
- [ ] Redis cluster provisioned
- [ ] Kafka cluster provisioned
- [ ] Elasticsearch cluster provisioned
- [ ] SSL certificates obtained
- [ ] DNS records configured
- [ ] Secrets prepared (API keys, database credentials)
- [ ] ConfigMaps prepared
- [ ] Monitoring stack deployed (Prometheus, Grafana)
- [ ] Logging stack deployed (ELK)

## Step 1: Prepare the Cluster

### Create Namespace

```bash
kubectl create namespace commercesphere
kubectl create namespace commercesphere-staging
```

### Set Default Namespace

```bash
kubectl config set-context --current --namespace=commercesphere
```

### Install Ingress Controller

```bash
# Using Nginx Ingress
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm repo update

helm install nginx-ingress ingress-nginx/ingress-nginx \
  --namespace ingress-nginx \
  --create-namespace \
  --set controller.replicaCount=3 \
  --set controller.nodeSelector."kubernetes\.io/os"=linux \
  --set defaultBackend.nodeSelector."kubernetes\.io/os"=linux
```

### Install Cert Manager (for SSL)

```bash
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.13.0/cert-manager.yaml
```

## Step 2: Configure Secrets

### Create Database Secrets

```bash
kubectl create secret generic postgres-credentials \
  --from-literal=username=commercesphere \
  --from-literal=password='<strong-password>' \
  --namespace=commercesphere
```

### Create API Keys Secret

```bash
kubectl create secret generic api-keys \
  --from-literal=stripe-secret-key='<stripe-key>' \
  --from-literal=sendgrid-api-key='<sendgrid-key>' \
  --from-literal=twilio-auth-token='<twilio-token>' \
  --from-literal=jwt-secret='<jwt-secret>' \
  --namespace=commercesphere
```

### Create AWS Credentials (for S3)

```bash
kubectl create secret generic aws-credentials \
  --from-literal=access-key-id='<aws-access-key>' \
  --from-literal=secret-access-key='<aws-secret-key>' \
  --namespace=commercesphere
```

## Step 3: Deploy Infrastructure Services

### Option A: Managed Services (Recommended for Production)

Use cloud provider managed services:
- **AWS:** RDS (PostgreSQL), ElastiCache (Redis), MSK (Kafka), OpenSearch
- **GCP:** Cloud SQL, Memorystore, Pub/Sub, Elasticsearch Service
- **Azure:** Azure Database, Azure Cache, Event Hubs, Azure Search

Update ConfigMaps with managed service endpoints.

### Option B: In-Cluster Deployment

Deploy stateful services within Kubernetes:

```bash
# Deploy PostgreSQL
kubectl apply -f kubernetes/infrastructure/postgresql.yaml

# Deploy Redis
kubectl apply -f kubernetes/infrastructure/redis.yaml

# Deploy Kafka
kubectl apply -f kubernetes/infrastructure/kafka.yaml

# Deploy Elasticsearch
kubectl apply -f kubernetes/infrastructure/elasticsearch.yaml
```

**Note:** In-cluster stateful services require proper persistent volume configuration and backup strategies.

## Step 4: Create ConfigMaps

```bash
kubectl apply -f kubernetes/configmaps.yaml
```

Example ConfigMap:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: service-config
  namespace: commercesphere
data:
  DATABASE_HOST: "postgres-service.commercesphere.svc.cluster.local"
  DATABASE_PORT: "5432"
  REDIS_HOST: "redis-service.commercesphere.svc.cluster.local"
  REDIS_PORT: "6379"
  KAFKA_BROKERS: "kafka-service.commercesphere.svc.cluster.local:9092"
  ELASTICSEARCH_URL: "http://elasticsearch-service.commercesphere.svc.cluster.local:9200"
  NODE_ENV: "production"
  LOG_LEVEL: "info"
```

## Step 5: Deploy Microservices

### Deploy All Services

```bash
# Deploy in order (dependencies first)
kubectl apply -f kubernetes/auth-service.yaml
kubectl apply -f kubernetes/product-service.yaml
kubectl apply -f kubernetes/order-service.yaml
kubectl apply -f kubernetes/payment-service.yaml
kubectl apply -f kubernetes/notification-service.yaml
kubectl apply -f kubernetes/search-service.yaml
kubectl apply -f kubernetes/recommendation-service.yaml
kubectl apply -f kubernetes/analytics-service.yaml
kubectl apply -f kubernetes/gateway.yaml
```

### Or Use Make Command

```bash
make deploy-production
```

### Verify Deployments

```bash
# Check deployment status
kubectl get deployments

# Check pod status
kubectl get pods

# Check services
kubectl get services

# View logs
kubectl logs -f deployment/auth-service
```

## Step 6: Configure Ingress

```bash
kubectl apply -f kubernetes/ingress.yaml
```

Example Ingress configuration:

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: commercesphere-ingress
  namespace: commercesphere
  annotations:
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
    nginx.ingress.kubernetes.io/rate-limit: "100"
spec:
  ingressClassName: nginx
  tls:
  - hosts:
    - api.commercesphere.com
    secretName: commercesphere-tls
  rules:
  - host: api.commercesphere.com
    http:
      paths:
      - path: /auth
        pathType: Prefix
        backend:
          service:
            name: auth-service
            port:
              number: 80
      - path: /products
        pathType: Prefix
        backend:
          service:
            name: product-service
            port:
              number: 80
      # ... other services
```

## Step 7: Configure Horizontal Pod Autoscaling

HPA is configured in the deployment manifests. Verify:

```bash
kubectl get hpa

# Expected output:
# NAME              REFERENCE                    TARGETS   MINPODS   MAXPODS
# auth-service      Deployment/auth-service      45%/70%   3         10
# product-service   Deployment/product-service   52%/70%   3         10
```

## Step 8: Initialize Databases

Run database migrations:

```bash
# Create a job to run migrations
kubectl apply -f kubernetes/jobs/db-migration.yaml

# Check job status
kubectl get jobs

# View migration logs
kubectl logs job/db-migration
```

## Step 9: Smoke Tests

Run smoke tests to verify deployment:

```bash
# Run smoke test job
kubectl apply -f kubernetes/jobs/smoke-tests.yaml

# Check results
kubectl logs job/smoke-tests
```

Or manually test endpoints:

```bash
# Get ingress IP
INGRESS_IP=$(kubectl get ingress commercesphere-ingress -o jsonpath='{.status.loadBalancer.ingress[0].ip}')

# Test health endpoints
curl https://api.commercesphere.com/auth/health
curl https://api.commercesphere.com/products/health
curl https://api.commercesphere.com/orders/health
```

## Deployment Strategies

### Rolling Update (Default)

Gradually replaces old pods with new ones:

```bash
# Update image
kubectl set image deployment/product-service \
  product-service=commercesphere/product-service:v1.2.0

# Monitor rollout
kubectl rollout status deployment/product-service

# Rollback if needed
kubectl rollout undo deployment/product-service
```

### Canary Deployment

Deploy new version to a subset of traffic:

```bash
# Create canary deployment
kubectl apply -f kubernetes/deployments/product-service-canary.yaml

# Configure traffic split (90/10)
kubectl apply -f kubernetes/traffic-split.yaml

# Monitor metrics
# If successful, promote canary
kubectl apply -f kubernetes/deployments/product-service-v2.yaml

# Remove canary
kubectl delete -f kubernetes/deployments/product-service-canary.yaml
```

### Blue-Green Deployment

Deploy to separate environment and switch:

```bash
# Deploy green version
kubectl apply -f kubernetes/deployments/product-service-green.yaml

# Test green deployment
curl https://green.api.commercesphere.com/products/health

# Switch traffic
kubectl patch service product-service -p '{"spec":{"selector":{"version":"green"}}}'

# Keep blue for rollback, remove after verification
```

## Monitoring Setup

### Deploy Prometheus

```bash
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update

helm install prometheus prometheus-community/kube-prometheus-stack \
  --namespace monitoring \
  --create-namespace \
  --set prometheus.prometheusSpec.serviceMonitorSelectorNilUsesHelmValues=false
```

### Deploy Grafana Dashboards

```bash
kubectl apply -f observability/grafana/provisioning/dashboards/
```

### Access Grafana

```bash
kubectl port-forward -n monitoring svc/prometheus-grafana 3000:80
# Open http://localhost:3000
# Default credentials: admin/prom-operator
```

## Logging Setup

### Deploy ELK Stack

```bash
# Elasticsearch
helm install elasticsearch elastic/elasticsearch \
  --namespace logging \
  --create-namespace

# Logstash
kubectl apply -f observability/logstash/

# Kibana
helm install kibana elastic/kibana \
  --namespace logging
```

### Configure Log Forwarding

```bash
# Deploy Fluentd or Filebeat
kubectl apply -f kubernetes/logging/fluentd-daemonset.yaml
```

## Backup and Disaster Recovery

### Database Backups

```bash
# Create backup CronJob
kubectl apply -f kubernetes/jobs/db-backup-cronjob.yaml

# Manual backup
kubectl create job --from=cronjob/db-backup db-backup-manual
```

### Backup Strategy

- **Frequency:** Daily automated backups
- **Retention:** 30 days for daily, 12 months for monthly
- **Storage:** S3 or equivalent object storage
- **Testing:** Monthly restore tests

### Disaster Recovery Plan

1. **Database Restore:**
   ```bash
   kubectl apply -f kubernetes/jobs/db-restore.yaml
   ```

2. **Service Redeployment:**
   ```bash
   make deploy-production
   ```

3. **Verify Services:**
   ```bash
   make smoke-test-production
   ```

## Scaling

### Manual Scaling

```bash
# Scale specific service
kubectl scale deployment product-service --replicas=5

# Scale all services
make scale-production REPLICAS=5
```

### Auto-Scaling Configuration

HPA automatically scales based on CPU/memory:

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: product-service-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: product-service
  minReplicas: 3
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
```

## Security Hardening

### Network Policies

```bash
kubectl apply -f kubernetes/network-policies/
```

### Pod Security Policies

```bash
kubectl apply -f kubernetes/pod-security-policies/
```

### RBAC Configuration

```bash
kubectl apply -f kubernetes/rbac/
```

### Secrets Encryption

Enable encryption at rest for secrets:

```bash
# Configure encryption provider
kubectl apply -f kubernetes/encryption-config.yaml
```

## Troubleshooting

### Pod Not Starting

```bash
# Describe pod
kubectl describe pod <pod-name>

# Check logs
kubectl logs <pod-name>

# Check events
kubectl get events --sort-by=.metadata.creationTimestamp
```

### Service Not Accessible

```bash
# Check service
kubectl get svc <service-name>

# Check endpoints
kubectl get endpoints <service-name>

# Test from within cluster
kubectl run -it --rm debug --image=busybox --restart=Never -- wget -O- http://<service-name>
```

### Database Connection Issues

```bash
# Test database connectivity
kubectl run -it --rm psql --image=postgres:15 --restart=Never -- \
  psql -h postgres-service -U commercesphere -d auth_service

# Check secrets
kubectl get secret postgres-credentials -o yaml
```

### High Memory Usage

```bash
# Check resource usage
kubectl top pods

# Check resource limits
kubectl describe pod <pod-name> | grep -A 5 "Limits"

# Adjust limits if needed
kubectl set resources deployment <deployment-name> \
  --limits=memory=1Gi \
  --requests=memory=512Mi
```

## Maintenance

### Update Services

```bash
# Update single service
kubectl set image deployment/product-service \
  product-service=commercesphere/product-service:v1.3.0

# Update all services
make update-production VERSION=v1.3.0
```

### Drain Node for Maintenance

```bash
# Cordon node (prevent new pods)
kubectl cordon <node-name>

# Drain node (evict pods)
kubectl drain <node-name> --ignore-daemonsets --delete-emptydir-data

# Perform maintenance...

# Uncordon node
kubectl uncordon <node-name>
```

### Certificate Renewal

Cert-manager handles automatic renewal. Manual renewal:

```bash
# Force renewal
kubectl delete secret commercesphere-tls
kubectl delete certificaterequest --all
```

## Cost Optimization

### Right-Sizing Resources

```bash
# Analyze resource usage
kubectl top pods --all-namespaces

# Adjust resource requests/limits based on actual usage
```

### Use Spot/Preemptible Instances

Configure node pools with spot instances for non-critical workloads.

### Implement Pod Disruption Budgets

```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: product-service-pdb
spec:
  minAvailable: 2
  selector:
    matchLabels:
      app: product-service
```

## Multi-Region Deployment

### Active-Active Setup

1. Deploy to multiple regions
2. Configure global load balancer
3. Set up database replication
4. Configure Kafka mirroring

### Active-Passive Setup

1. Deploy to primary region
2. Set up standby in secondary region
3. Configure database replication
4. Implement failover procedures

## Compliance and Auditing

### Enable Audit Logging

```bash
# Configure audit policy
kubectl apply -f kubernetes/audit-policy.yaml
```

### Regular Security Scans

```bash
# Scan images for vulnerabilities
trivy image commercesphere/product-service:latest

# Scan cluster configuration
kube-bench run --targets master,node
```

## Rollback Procedures

### Rollback Deployment

```bash
# View rollout history
kubectl rollout history deployment/product-service

# Rollback to previous version
kubectl rollout undo deployment/product-service

# Rollback to specific revision
kubectl rollout undo deployment/product-service --to-revision=2
```

### Database Rollback

```bash
# Restore from backup
kubectl apply -f kubernetes/jobs/db-restore.yaml \
  --env BACKUP_DATE=2024-01-15
```

## Support and Escalation

### Monitoring Alerts

- **Critical:** Page on-call engineer immediately
- **Warning:** Create ticket for investigation
- **Info:** Log for analysis

### Escalation Path

1. On-call engineer
2. Team lead
3. Platform architect
4. CTO

### Contact Information

- **On-call:** +1-555-0100
- **Email:** ops@commercesphere.com
- **Slack:** #commercesphere-ops

## Appendix

### Useful Commands

```bash
# Get all resources
kubectl get all -n commercesphere

# Describe deployment
kubectl describe deployment <name>

# View logs (last 100 lines)
kubectl logs --tail=100 <pod-name>

# Execute command in pod
kubectl exec -it <pod-name> -- /bin/sh

# Port forward
kubectl port-forward svc/<service-name> 8080:80

# Copy files
kubectl cp <pod-name>:/path/to/file ./local-file
```

### Resource Limits Guide

| Service | CPU Request | CPU Limit | Memory Request | Memory Limit |
|---------|-------------|-----------|----------------|--------------|
| Auth | 250m | 500m | 256Mi | 512Mi |
| Product | 250m | 500m | 256Mi | 512Mi |
| Order | 250m | 500m | 256Mi | 512Mi |
| Payment | 250m | 500m | 256Mi | 512Mi |
| Search | 500m | 1000m | 512Mi | 1Gi |
| Analytics | 500m | 1000m | 512Mi | 1Gi |

### Environment Variables Reference

See `kubernetes/configmaps.yaml` for complete list.

### Further Reading

- [Kubernetes Documentation](https://kubernetes.io/docs/)
- [Helm Documentation](https://helm.sh/docs/)
- [Prometheus Operator](https://prometheus-operator.dev/)
- [Cert Manager](https://cert-manager.io/docs/)
