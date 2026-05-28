# CI/CD Quick Reference

Quick reference guide for CommerceSphere CI/CD operations.

## 🚀 Quick Start

### First Time Setup

```bash
# 1. Configure GitHub secrets (see docs/CI_CD_GUIDE.md)
# 2. Create Kubernetes namespaces
kubectl create namespace staging
kubectl create namespace production

# 3. Apply configurations
kubectl apply -f kubernetes/configmaps.yaml -n staging
kubectl apply -f kubernetes/configmaps.yaml -n production
```

### Daily Workflow

```bash
# 1. Create feature branch
git checkout -b feature/my-feature

# 2. Make changes and commit
git add .
git commit -m "feat: add new feature"

# 3. Push and create PR
git push origin feature/my-feature

# 4. After PR approval, merge to develop
git checkout develop
git merge feature/my-feature
git push origin develop
# → Triggers staging deployment

# 5. After staging verification, merge to main
git checkout main
git merge develop
git push origin main
# → Triggers production deployment (requires approval)
```

## 📋 Common Commands

### Local Development

```bash
make help                    # Show all available commands
make install                 # Install dependencies
make build                   # Build all services
make lint                    # Run linting
make test                    # Run tests
make dev                     # Start local environment
make dev-down                # Stop local environment
```

### Docker Operations

```bash
make docker-build            # Build all Docker images
make docker-push             # Push images to registry
make docker-tag VERSION=v1.0.0  # Tag images with version
```

### Deployment

```bash
make deploy-staging          # Deploy to staging
make deploy-production       # Deploy to production (with confirmation)
make rollback-staging        # Rollback staging
make rollback-production     # Rollback production (with confirmation)
```

### Testing

```bash
make smoke-test-local        # Test local environment
make smoke-test-staging      # Test staging environment
make smoke-test-production   # Test production environment
```

### Monitoring

```bash
make status-staging          # Check staging status
make status-production       # Check production status
make logs-staging SERVICE=product    # View staging logs
make logs-production SERVICE=product # View production logs
```

## 🔄 Deployment Workflows

### Staging Deployment (Automatic)

```
Push to develop
    ↓
CI Pipeline (lint, test, build)
    ↓
Deploy to Staging
    ↓
Run Smoke Tests
    ↓
Run Integration Tests
    ↓
✅ Complete (or auto-rollback on failure)
```

### Production Deployment (Manual Approval)

```
Push to main
    ↓
CI Pipeline (lint, test, build)
    ↓
⏸️  Manual Approval Required
    ↓
Pre-deployment Checks
    ↓
Canary Deployment (10% traffic)
    ↓
Monitor (10 minutes)
    ↓
Promote to 50% traffic
    ↓
Monitor (5 minutes)
    ↓
Full Rollout (100% traffic)
    ↓
Run Smoke Tests
    ↓
✅ Complete (or auto-rollback on failure)
```

## 🔧 Troubleshooting

### CI Pipeline Failed

```bash
# Check GitHub Actions logs
# Go to: https://github.com/your-org/commercesphere/actions

# Run CI locally
make ci-local

# Fix linting issues
make lint-fix

# Run tests
make test
```

### Deployment Failed

```bash
# Check pod status
kubectl get pods -n production

# Check logs
kubectl logs -f deployment/product-service -n production

# Describe pod for events
kubectl describe pod <pod-name> -n production

# Manual rollback
make rollback-production
```

### Smoke Tests Failed

```bash
# Run locally with verbose output
bash -x scripts/smoke-tests.sh staging

# Check service health
curl https://staging-api.commercesphere.example.com/health

# Check individual service
kubectl logs deployment/product-service -n staging
```

## 📊 Monitoring URLs

- **Grafana:** https://grafana.commercesphere.example.com
- **Kibana:** https://kibana.commercesphere.example.com
- **Jaeger:** https://jaeger.commercesphere.example.com
- **Staging API:** https://staging-api.commercesphere.example.com
- **Production API:** https://api.commercesphere.example.com

## 🔐 Required Secrets

| Secret | Description |
|--------|-------------|
| `DOCKER_USERNAME` | Docker Hub username |
| `DOCKER_PASSWORD` | Docker Hub access token |
| `KUBE_CONFIG_STAGING` | Staging cluster kubeconfig (base64) |
| `KUBE_CONFIG_PRODUCTION` | Production cluster kubeconfig (base64) |
| `TEST_USER_EMAIL` | Test user email |
| `TEST_USER_PASSWORD` | Test user password |

## 🎯 Performance Targets

| Metric | Target |
|--------|--------|
| Response Time (p95) | < 500ms |
| Response Time (p99) | < 1000ms |
| Error Rate | < 1% |
| Uptime | > 99.9% |
| Deployment Time | < 15 minutes |

## 🚨 Emergency Procedures

### Rollback Production Immediately

```bash
# Option 1: Using Makefile
make rollback-production

# Option 2: Using kubectl
for service in auth gateway product order payment notification search recommendation analytics; do
  kubectl rollout undo deployment/${service}-service -n production
done

# Option 3: Via GitHub Actions
# Go to Actions → Re-run failed jobs
```

### Check System Health

```bash
# All services status
kubectl get all -n production

# Check pod health
kubectl get pods -n production | grep -v Running

# Check recent events
kubectl get events -n production --sort-by='.lastTimestamp' | tail -20

# Run smoke tests
make smoke-test-production
```

## 📞 Support

- **Slack:** #devops-support
- **Email:** devops@commercesphere.example.com
- **On-call:** Check PagerDuty rotation
- **Documentation:** docs/CI_CD_GUIDE.md

## 🔗 Useful Links

- [Full CI/CD Guide](docs/CI_CD_GUIDE.md)
- [GitHub Actions Workflows](.github/workflows/README.md)
- [Integration Tests](tests/integration/README.md)
- [Performance Tests](tests/performance/README.md)
- [Architecture Documentation](ARCHITECTURE.md)

---

**Last Updated:** 2024-01-15  
**Version:** 1.0.0
