# CI/CD Guide for CommerceSphere

This guide provides comprehensive documentation for the Continuous Integration and Continuous Deployment (CI/CD) pipeline for the CommerceSphere microservices platform.

## Table of Contents

1. [Overview](#overview)
2. [Pipeline Architecture](#pipeline-architecture)
3. [Setup Instructions](#setup-instructions)
4. [Workflows](#workflows)
5. [Deployment Strategies](#deployment-strategies)
6. [Rollback Procedures](#rollback-procedures)
7. [Monitoring and Alerts](#monitoring-and-alerts)
8. [Troubleshooting](#troubleshooting)
9. [Best Practices](#best-practices)

## Overview

The CI/CD pipeline automates the process of testing, building, and deploying the CommerceSphere platform. It consists of:

- **Continuous Integration (CI):** Automated testing and building on every code push
- **Continuous Deployment (CD):** Automated deployment to staging and production environments
- **Automated Rollback:** Automatic rollback on deployment failures
- **Smoke Tests:** Post-deployment verification tests

### Key Features

✅ Automated testing (unit, integration, property-based)  
✅ Docker image building and security scanning  
✅ Multi-environment deployment (staging, production)  
✅ Canary and rolling deployment strategies  
✅ Automatic rollback on failures  
✅ Manual approval gates for production  
✅ Comprehensive smoke tests  
✅ Dependency updates and security audits  

## Pipeline Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Developer Workflow                       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    CI Pipeline (ci.yml)                      │
│  • Lint code                                                 │
│  • Run tests (unit, property-based)                         │
│  • Build Docker images                                       │
│  • Security scan (Trivy)                                     │
│  • Push to container registry                                │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              CD Staging (cd-staging.yml)                     │
│  • Deploy to staging                                         │
│  • Run smoke tests                                           │
│  • Run integration tests                                     │
│  • Run performance tests                                     │
│  • Auto-rollback on failure                                  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│           CD Production (cd-production.yml)                  │
│  • Manual approval gate                                      │
│  • Pre-deployment checks                                     │
│  • Canary deployment (10% → 50% → 100%)                     │
│  • Smoke tests                                               │
│  • Auto-rollback on failure                                  │
│  • Create GitHub release                                     │
└─────────────────────────────────────────────────────────────┘
```

## Setup Instructions

### Prerequisites

- GitHub repository with admin access
- Docker Hub account or container registry
- Kubernetes clusters (staging and production)
- kubectl configured with cluster access

### 1. Configure GitHub Secrets

Navigate to your repository → Settings → Secrets and variables → Actions

#### Required Secrets

| Secret Name | Description | Example |
|------------|-------------|---------|
| `DOCKER_USERNAME` | Docker Hub username | `mycompany` |
| `DOCKER_PASSWORD` | Docker Hub access token | `dckr_pat_...` |
| `KUBE_CONFIG_STAGING` | Base64-encoded kubeconfig for staging | `apiVersion: v1...` |
| `KUBE_CONFIG_PRODUCTION` | Base64-encoded kubeconfig for production | `apiVersion: v1...` |
| `TEST_USER_EMAIL` | Test user email for integration tests | `test@example.com` |
| `TEST_USER_PASSWORD` | Test user password | `SecurePassword123!` |
| `SNYK_TOKEN` | Snyk API token (optional) | `...` |

#### Generate Kubeconfig Secrets

```bash
# For staging
kubectl config view --flatten --minify > staging-kubeconfig.yaml
cat staging-kubeconfig.yaml | base64 -w 0
# Copy output and add as KUBE_CONFIG_STAGING

# For production
kubectl config view --flatten --minify > production-kubeconfig.yaml
cat production-kubeconfig.yaml | base64 -w 0
# Copy output and add as KUBE_CONFIG_PRODUCTION
```

### 2. Configure GitHub Environments

Create three environments with protection rules:

#### Staging Environment
- Name: `staging`
- URL: `https://staging.commercesphere.example.com`
- Protection rules: None (auto-deploy)

#### Production Approval Environment
- Name: `production-approval`
- Protection rules:
  - ✅ Required reviewers (add team leads)
  - ✅ Wait timer: 0 minutes

#### Production Environment
- Name: `production`
- URL: `https://commercesphere.example.com`
- Protection rules:
  - ✅ Required reviewers (add senior engineers)
  - ⏱️ Wait timer: 5 minutes (optional)

### 3. Set Up Kubernetes Namespaces

```bash
# Create namespaces
kubectl create namespace staging
kubectl create namespace production

# Apply ConfigMaps
kubectl apply -f kubernetes/configmaps.yaml -n staging
kubectl apply -f kubernetes/configmaps.yaml -n production

# Apply Secrets (update with actual values first)
kubectl apply -f kubernetes/secrets-example.yaml -n staging
kubectl apply -f kubernetes/secrets-example.yaml -n production

# Verify
kubectl get all -n staging
kubectl get all -n production
```

### 4. Configure Branch Protection

Set up branch protection rules for `main` and `develop`:

- ✅ Require pull request reviews (1 approval)
- ✅ Require status checks to pass (CI pipeline)
- ✅ Require branches to be up to date
- ✅ Include administrators

## Workflows

### CI Pipeline (`ci.yml`)

**Triggers:**
- Push to any branch
- Pull requests to `main` or `develop`

**Jobs:**

1. **Lint:** ESLint and TypeScript compilation
2. **Test Services:** Parallel testing of all Node.js services
3. **Test Recommendation:** Python service testing
4. **Build Images:** Docker image building and pushing
5. **Security Scan:** Trivy vulnerability scanning

**Duration:** ~10-15 minutes

### CD Staging (`cd-staging.yml`)

**Triggers:**
- Push to `develop` branch
- Manual workflow dispatch

**Jobs:**

1. **Deploy Staging:** Deploy all services to staging
2. **Integration Tests:** Run integration test suite
3. **Performance Tests:** Run k6 load tests

**Duration:** ~15-20 minutes

**Auto-rollback:** Yes, on any failure

### CD Production (`cd-production.yml`)

**Triggers:**
- Push to `main` branch
- Manual workflow dispatch

**Jobs:**

1. **Approval:** Manual approval gate
2. **Pre-deployment Checks:** Verify images and staging health
3. **Deploy Production:** Canary or rolling deployment
4. **Post-deployment:** Smoke tests and verification

**Duration:** ~30-45 minutes (including approval wait)

**Auto-rollback:** Yes, on health check failures

### Property-Based Tests (`property-tests.yml`)

**Triggers:**
- Push to `main` or `develop`
- Pull requests
- Nightly at 2 AM UTC
- Manual workflow dispatch

**Jobs:**

1. **Property Tests:** Run property-based tests with 1000 iterations

**Duration:** ~20-30 minutes

### Dependency Updates (`dependency-update.yml`)

**Triggers:**
- Weekly on Mondays at 9 AM UTC
- Manual workflow dispatch

**Jobs:**

1. **Update NPM Dependencies:** Update Node.js packages
2. **Update Python Dependencies:** Update Python packages
3. **Security Audit:** Run npm audit and Snyk scan

**Duration:** ~10 minutes

## Deployment Strategies

### Canary Deployment (Recommended for Production)

Gradual rollout with traffic shifting:

```
1. Deploy canary (10% traffic)
   ↓ Monitor for 10 minutes
2. Promote to 50% traffic
   ↓ Monitor for 5 minutes
3. Full rollout (100% traffic)
   ↓ Cleanup canary
4. Complete
```

**Advantages:**
- Minimal risk
- Early detection of issues
- Easy rollback

**Use when:**
- Major version updates
- Significant feature changes
- Database schema changes

### Rolling Update (Default for Staging)

Sequential pod replacement:

```
1. Update pod 1
   ↓ Wait for health check
2. Update pod 2
   ↓ Wait for health check
3. Update pod 3
   ↓ Complete
```

**Advantages:**
- Zero downtime
- Simple and reliable
- Kubernetes native

**Use when:**
- Minor updates
- Bug fixes
- Configuration changes

### Blue-Green Deployment (Manual)

Complete environment switch:

```
1. Deploy to green environment
   ↓ Test thoroughly
2. Switch traffic to green
   ↓ Monitor
3. Keep blue as backup
   ↓ Decommission blue
```

**Advantages:**
- Instant rollback
- Full testing before switch
- No mixed versions

**Use when:**
- Major releases
- Database migrations
- Infrastructure changes

## Rollback Procedures

### Automatic Rollback

The pipeline automatically rolls back on:
- Failed health checks
- Failed smoke tests
- Deployment timeout
- Pod crash loops

### Manual Rollback

#### Using GitHub Actions

1. Go to Actions → CD Production
2. Click "Re-run failed jobs"
3. Or trigger rollback workflow

#### Using kubectl

```bash
# Rollback specific service
kubectl rollout undo deployment/product-service -n production

# Rollback to specific revision
kubectl rollout history deployment/product-service -n production
kubectl rollout undo deployment/product-service -n production --to-revision=2

# Rollback all services
for service in auth gateway product order payment notification search recommendation analytics; do
  kubectl rollout undo deployment/${service}-service -n production
done
```

#### Using Makefile

```bash
# Rollback staging
make rollback-staging

# Rollback production (with confirmation)
make rollback-production
```

### Verify Rollback

```bash
# Check deployment status
kubectl get deployments -n production

# Check pod status
kubectl get pods -n production

# Check rollout history
kubectl rollout history deployment/product-service -n production

# Run smoke tests
make smoke-test-production
```

## Monitoring and Alerts

### Key Metrics to Monitor

1. **Deployment Metrics:**
   - Deployment success rate
   - Deployment duration
   - Rollback frequency

2. **Application Metrics:**
   - Request rate (requests/sec)
   - Error rate (%)
   - Response time (p50, p95, p99)
   - Pod health status

3. **Infrastructure Metrics:**
   - CPU utilization
   - Memory usage
   - Disk I/O
   - Network traffic

### Monitoring Tools

- **Grafana:** https://grafana.commercesphere.example.com
- **Prometheus:** Metrics collection
- **Kibana:** Log analysis
- **Jaeger:** Distributed tracing

### Alert Conditions

| Condition | Severity | Action |
|-----------|----------|--------|
| Deployment failed | Critical | Auto-rollback + notify |
| Error rate > 5% | High | Investigate immediately |
| Response time p99 > 2s | Medium | Review performance |
| Pod crash loop | High | Check logs + restart |
| Disk usage > 85% | Medium | Scale or cleanup |

## Troubleshooting

### CI Pipeline Failures

#### Linting Errors

```bash
# Run locally
npm run lint

# Auto-fix
npm run lint -- --fix

# Check specific service
npm run lint -w @commercesphere/product-service
```

#### Test Failures

```bash
# Run all tests
npm test

# Run specific service tests
npm test -w @commercesphere/product-service

# Run with coverage
npm test -- --coverage
```

#### Build Failures

```bash
# Build locally
npm run build

# Build specific service
npm run build -w @commercesphere/product-service

# Clean and rebuild
make clean
make build
```

### Deployment Failures

#### Image Not Found

```bash
# Verify image exists
docker manifest inspect commercesphere/product:latest

# Check Docker Hub
# Visit: https://hub.docker.com/r/commercesphere/product/tags

# Rebuild and push
make docker-build
make docker-push
```

#### Pod Crash Loop

```bash
# Check pod status
kubectl get pods -n production

# Describe pod
kubectl describe pod <pod-name> -n production

# Check logs
kubectl logs <pod-name> -n production

# Check previous logs
kubectl logs <pod-name> -n production --previous
```

#### Health Check Failures

```bash
# Test health endpoint
curl https://api.commercesphere.example.com/products/health

# Check pod events
kubectl describe pod <pod-name> -n production

# Check service configuration
kubectl get service product-service -n production -o yaml
```

### Smoke Test Failures

```bash
# Run locally
./scripts/smoke-tests.sh local

# Run with verbose output
bash -x ./scripts/smoke-tests.sh staging

# Test specific endpoint
curl -v https://staging-api.commercesphere.example.com/products/health
```

## Best Practices

### Development Workflow

1. **Feature Development:**
   ```bash
   git checkout -b feature/new-feature
   # Make changes
   git commit -m "feat: add new feature"
   git push origin feature/new-feature
   # Create pull request
   ```

2. **Code Review:**
   - At least one approval required
   - CI must pass
   - Address all comments

3. **Merge to Develop:**
   ```bash
   # After PR approval
   git checkout develop
   git merge feature/new-feature
   git push origin develop
   # Triggers staging deployment
   ```

4. **Verify Staging:**
   - Check deployment status
   - Run smoke tests
   - Test new features
   - Monitor metrics

5. **Release to Production:**
   ```bash
   git checkout main
   git merge develop
   git push origin main
   # Triggers production deployment
   # Approve in GitHub Actions UI
   ```

### Deployment Best Practices

1. **Always deploy to staging first**
2. **Run full test suite before production**
3. **Use canary deployments for major changes**
4. **Monitor metrics during deployment**
5. **Keep rollback plan ready**
6. **Document changes in release notes**
7. **Communicate with team before production deploy**
8. **Deploy during low-traffic hours**

### Security Best Practices

1. **Rotate secrets regularly**
2. **Review security scan results**
3. **Keep dependencies updated**
4. **Use least privilege for service accounts**
5. **Enable audit logging**
6. **Review access logs regularly**

### Testing Best Practices

1. **Write tests before code (TDD)**
2. **Maintain high test coverage (>80%)**
3. **Run property-based tests regularly**
4. **Test error conditions**
5. **Use realistic test data**
6. **Mock external dependencies**

## Quick Reference

### Common Commands

```bash
# Run CI locally
make ci-local

# Build Docker images
make docker-build

# Deploy to staging
make deploy-staging

# Run smoke tests
make smoke-test-staging

# View logs
make logs-staging SERVICE=product

# Check status
make status-production

# Rollback
make rollback-production
```

### Useful Links

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Kubernetes Documentation](https://kubernetes.io/docs/)
- [Docker Documentation](https://docs.docker.com/)
- [Grafana Dashboards](https://grafana.commercesphere.example.com)

## Support

For issues or questions:

1. Check this guide
2. Review GitHub Actions logs
3. Check Kubernetes events and logs
4. Contact DevOps team on Slack: #devops-support
5. Create issue in GitHub repository

---

**Last Updated:** 2024-01-15  
**Maintained by:** DevOps Team
