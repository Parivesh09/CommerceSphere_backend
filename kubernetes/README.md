# Kubernetes Deployment Guide

This directory contains Kubernetes manifests for deploying the CommerceSphere microservices platform.

## Overview

The platform consists of the following services:
- **API Gateway** - Entry point for all client requests
- **Auth Service** - User authentication and authorization
- **Product Service** - Product catalog and inventory management
- **Order Service** - Order processing and saga orchestration
- **Payment Service** - Payment processing via Stripe
- **Notification Service** - Multi-channel notifications (email, SMS, push)
- **Search Service** - Full-text search with Elasticsearch
- **Recommendation Service** - Personalized product recommendations
- **Analytics Service** - Business metrics and analytics

## Prerequisites

- Kubernetes cluster (v1.28+)
- kubectl configured to access your cluster
- Container images built and pushed to a registry
- PostgreSQL databases for each service
- Redis cluster
- Kafka cluster
- Elasticsearch cluster

## File Structure

```
kubernetes/
├── README.md                        # This file
├── configmaps.yaml                  # Configuration for all services
├── secrets-example.yaml             # Example secrets (DO NOT commit actual secrets)
├── auth-service.yaml                # Auth service deployment
├── product-service.yaml             # Product service deployment
├── order-service.yaml               # Order service deployment
├── payment-service.yaml             # Payment service deployment
├── notification-service.yaml        # Notification service deployment
├── search-service.yaml              # Search service deployment
├── recommendation-service.yaml      # Recommendation service deployment
├── analytics-service.yaml           # Analytics service deployment
└── gateway.yaml                     # API Gateway deployment
```

## Deployment Steps

### 1. Create Namespace (Optional)

```bash
kubectl create namespace commercesphere
kubectl config set-context --current --namespace=commercesphere
```

### 2. Create Secrets

**IMPORTANT:** Never commit actual secrets to version control!

Create secrets from the example file:

```bash
# Copy the example and fill in actual values
cp secrets-example.yaml secrets.yaml

# Edit secrets.yaml with your actual credentials
# Then apply:
kubectl apply -f secrets.yaml
```

Or create secrets using kubectl:

```bash
# Auth Service Secrets
kubectl create secret generic auth-service-secrets \
  --from-literal=jwt-secret=your-jwt-secret-change-in-production \
  --from-literal=database-url=postgresql://user:password@postgres:5432/auth_db \
  --from-literal=encryption-key=your-encryption-key-min-32-chars

# Product Service Secrets
kubectl create secret generic product-service-secrets \
  --from-literal=database-url=postgresql://user:password@postgres:5432/product_db \
  --from-literal=aws-access-key-id=your-aws-access-key \
  --from-literal=aws-secret-access-key=your-aws-secret-key \
  --from-literal=s3-bucket-name=commercesphere-products

# Order Service Secrets
kubectl create secret generic order-service-secrets \
  --from-literal=database-url=postgresql://user:password@postgres:5432/order_db

# Payment Service Secrets
kubectl create secret generic payment-service-secrets \
  --from-literal=database-url=postgresql://user:password@postgres:5432/payment_db \
  --from-literal=stripe-secret-key=sk_live_... \
  --from-literal=stripe-webhook-secret=whsec_... \
  --from-literal=encryption-key=your-encryption-key-min-32-chars

# Notification Service Secrets
kubectl create secret generic notification-service-secrets \
  --from-literal=database-url=postgresql://user:password@postgres:5432/notification_db \
  --from-literal=sendgrid-api-key=SG.... \
  --from-literal=twilio-account-sid=AC... \
  --from-literal=twilio-auth-token=... \
  --from-literal=twilio-phone-number=+1234567890 \
  --from-literal=fcm-server-key=...

# Recommendation Service Secrets
kubectl create secret generic recommendation-service-secrets \
  --from-literal=database-url=postgresql://user:password@postgres:5432/recommendation_db

# Analytics Service Secrets
kubectl create secret generic analytics-service-secrets \
  --from-literal=database-url=postgresql://user:password@postgres:5432/analytics_db

# Shared Secrets
kubectl create secret generic shared-secrets \
  --from-literal=redis-password=your-redis-password \
  --from-literal=elasticsearch-username=elastic \
  --from-literal=elasticsearch-password=your-es-password
```

### 3. Apply ConfigMaps

```bash
kubectl apply -f configmaps.yaml
```

### 4. Deploy Services

Deploy all services:

```bash
kubectl apply -f auth-service.yaml
kubectl apply -f product-service.yaml
kubectl apply -f order-service.yaml
kubectl apply -f payment-service.yaml
kubectl apply -f notification-service.yaml
kubectl apply -f search-service.yaml
kubectl apply -f recommendation-service.yaml
kubectl apply -f analytics-service.yaml
kubectl apply -f gateway.yaml
```

Or deploy all at once:

```bash
kubectl apply -f .
```

### 5. Verify Deployment

Check pod status:

```bash
kubectl get pods
kubectl get deployments
kubectl get services
kubectl get hpa
```

Check logs:

```bash
kubectl logs -f deployment/auth-service
kubectl logs -f deployment/product-service
```

## Configuration

### Resource Limits

Each service has defined resource requests and limits:

| Service | CPU Request | CPU Limit | Memory Request | Memory Limit |
|---------|-------------|-----------|----------------|--------------|
| Auth | 250m | 500m | 256Mi | 512Mi |
| Product | 500m | 1000m | 512Mi | 1Gi |
| Order | 500m | 1000m | 512Mi | 1Gi |
| Payment | 250m | 500m | 256Mi | 512Mi |
| Notification | 250m | 500m | 256Mi | 512Mi |
| Search | 500m | 1000m | 512Mi | 1Gi |
| Recommendation | 500m | 1000m | 512Mi | 1Gi |
| Analytics | 500m | 1000m | 512Mi | 1Gi |
| Gateway | 500m | 1000m | 512Mi | 1Gi |

### Autoscaling

All services have HorizontalPodAutoscaler configured:
- **CPU Threshold:** 70%
- **Memory Threshold:** 80%
- **Scale Down Stabilization:** 5 minutes
- **Scale Up:** Immediate

Replica ranges:
- Auth: 3-10 replicas
- Product: 3-15 replicas
- Order: 3-15 replicas
- Payment: 3-10 replicas
- Notification: 3-10 replicas
- Search: 3-15 replicas
- Recommendation: 3-10 replicas
- Analytics: 3-10 replicas
- Gateway: 3-20 replicas

### Health Checks

All services have liveness and readiness probes:

**Liveness Probe:**
- Path: `/health`
- Initial Delay: 30 seconds
- Period: 10 seconds
- Timeout: 5 seconds
- Failure Threshold: 3

**Readiness Probe:**
- Path: `/health`
- Initial Delay: 5 seconds
- Period: 5 seconds
- Timeout: 3 seconds
- Failure Threshold: 3

### Rolling Updates

All deployments use RollingUpdate strategy:
- **Max Surge:** 1 pod
- **Max Unavailable:** 0 pods

This ensures zero-downtime deployments.

## Updating Services

### Update Container Image

```bash
kubectl set image deployment/auth-service auth-service=commercesphere/auth-service:v2.0.0
```

### Update ConfigMap

```bash
# Edit configmaps.yaml
kubectl apply -f configmaps.yaml

# Restart pods to pick up new config
kubectl rollout restart deployment/auth-service
```

### Rollback Deployment

```bash
kubectl rollout undo deployment/auth-service
kubectl rollout undo deployment/auth-service --to-revision=2
```

## Monitoring

### View Metrics

All services expose Prometheus metrics on port 9090:

```bash
kubectl port-forward deployment/auth-service 9090:9090
curl http://localhost:9090/metrics
```

### View Logs

```bash
# Follow logs
kubectl logs -f deployment/auth-service

# View logs from all pods
kubectl logs -l app=auth-service --all-containers=true

# View logs with timestamps
kubectl logs deployment/auth-service --timestamps=true
```

### Check HPA Status

```bash
kubectl get hpa
kubectl describe hpa auth-service-hpa
```

## Troubleshooting

### Pod Not Starting

```bash
kubectl describe pod <pod-name>
kubectl logs <pod-name>
kubectl get events --sort-by='.lastTimestamp'
```

### Service Not Accessible

```bash
kubectl get svc
kubectl describe svc auth-service
kubectl get endpoints auth-service
```

### Database Connection Issues

```bash
# Check if secrets are properly configured
kubectl get secrets
kubectl describe secret auth-service-secrets

# Test database connectivity from a pod
kubectl exec -it <pod-name> -- sh
# Inside pod:
# nc -zv postgres 5432
```

### High Memory/CPU Usage

```bash
kubectl top pods
kubectl top nodes
kubectl describe hpa
```

## Scaling

### Manual Scaling

```bash
# Scale to specific replica count
kubectl scale deployment auth-service --replicas=5

# Scale multiple deployments
kubectl scale deployment auth-service product-service --replicas=5
```

### Adjust HPA

```bash
# Edit HPA
kubectl edit hpa auth-service-hpa

# Or apply updated manifest
kubectl apply -f auth-service.yaml
```

## Security

### Security Context

All pods run with security context:
- **runAsNonRoot:** true
- **runAsUser:** 1000
- **fsGroup:** 1000
- **allowPrivilegeEscalation:** false
- **Capabilities:** All dropped

### Network Policies

Consider implementing NetworkPolicies to restrict pod-to-pod communication:

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: auth-service-network-policy
spec:
  podSelector:
    matchLabels:
      app: auth-service
  policyTypes:
  - Ingress
  - Egress
  ingress:
  - from:
    - podSelector:
        matchLabels:
          app: api-gateway
    ports:
    - protocol: TCP
      port: 3000
```

## Cleanup

### Delete All Resources

```bash
kubectl delete -f .
```

### Delete Specific Service

```bash
kubectl delete -f auth-service.yaml
```

### Delete Secrets

```bash
kubectl delete secret auth-service-secrets
kubectl delete secret shared-secrets
```

## Production Considerations

1. **Use a proper secrets management solution** (HashiCorp Vault, AWS Secrets Manager, etc.)
2. **Implement NetworkPolicies** for pod-to-pod communication
3. **Set up Ingress** with TLS termination
4. **Configure PodDisruptionBudgets** for high availability
5. **Implement resource quotas** per namespace
6. **Set up monitoring and alerting** (Prometheus, Grafana)
7. **Configure log aggregation** (ELK stack, Loki)
8. **Implement distributed tracing** (Jaeger, Zipkin)
9. **Use StatefulSets** for stateful services (databases)
10. **Configure backup and disaster recovery** procedures

## Additional Resources

- [Kubernetes Documentation](https://kubernetes.io/docs/)
- [Kubernetes Best Practices](https://kubernetes.io/docs/concepts/configuration/overview/)
- [12-Factor App Methodology](https://12factor.net/)
- [CNCF Cloud Native Trail Map](https://github.com/cncf/trailmap)
