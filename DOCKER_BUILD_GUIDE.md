# Docker Build Guide

This guide explains how to build and run Docker images for all CommerceSphere microservices.

## Overview

All services use multi-stage Docker builds to optimize image sizes and security:
- **Build Stage**: Compiles TypeScript/Python code and installs all dependencies
- **Production Stage**: Contains only runtime dependencies and compiled code

## Prerequisites

- Docker 20.10 or higher
- Docker Compose 2.0 or higher (for orchestration)

## Building Individual Services

### Node.js Services (Auth, Product, Order, Payment, Notification, Search, Analytics)

Build from the project root:

```bash
# Auth Service
docker build -f services/auth/Dockerfile -t commercesphere/auth-service:latest .

# Product Service
docker build -f services/product/Dockerfile -t commercesphere/product-service:latest .

# Order Service
docker build -f services/order/Dockerfile -t commercesphere/order-service:latest .

# Payment Service
docker build -f services/payment/Dockerfile -t commercesphere/payment-service:latest .

# Notification Service
docker build -f services/notification/Dockerfile -t commercesphere/notification-service:latest .

# Search Service
docker build -f services/search/Dockerfile -t commercesphere/search-service:latest .

# Analytics Service
docker build -f services/analytics/Dockerfile -t commercesphere/analytics-service:latest .

# Gateway Service
docker build -f services/gateway/Dockerfile -t commercesphere/gateway-service:latest .
```

### Python Service (Recommendation)

```bash
docker build -f services/recommendation/Dockerfile -t commercesphere/recommendation-service:latest .
```

## Building All Services

Use the provided script to build all services at once:

```bash
# Build all services
for service in auth product order payment notification search analytics gateway recommendation; do
  echo "Building $service service..."
  docker build -f services/$service/Dockerfile -t commercesphere/$service-service:latest .
done
```

## Running Services

### Individual Service

```bash
docker run -d \
  --name auth-service \
  -p 3001:3001 \
  -e DATABASE_URL=postgresql://user:pass@host:5432/auth \
  -e REDIS_URL=redis://host:6379 \
  -e JWT_SECRET=your-secret \
  commercesphere/auth-service:latest
```

### Using Docker Compose

The recommended way to run all services together:

```bash
docker-compose up -d
```

## Image Optimization Features

### Multi-Stage Builds
- Separates build dependencies from runtime dependencies
- Reduces final image size by 60-70%
- Improves security by excluding build tools

### Alpine Base Images
- Node.js services use `node:20-alpine` (40MB vs 900MB for full image)
- Python service uses `python:3.11-slim` (120MB vs 900MB for full image)

### Layer Caching
- Package files copied before source code
- Dependencies installed before building
- Maximizes Docker layer cache efficiency

### Health Checks
All services include health check endpoints:
- Interval: 30 seconds
- Timeout: 3 seconds
- Start period: 5 seconds
- Retries: 3

## Port Mapping

| Service        | Port |
|----------------|------|
| Gateway        | 3000 |
| Auth           | 3001 |
| Product        | 3002 |
| Order          | 3003 |
| Payment        | 3004 |
| Notification   | 3005 |
| Search         | 3006 |
| Recommendation | 3007 |
| Analytics      | 3008 |

## Environment Variables

Each service requires specific environment variables. See individual service `.env.example` files:

- `services/auth/.env.example`
- `services/product/.env.example`
- `services/order/.env.example`
- etc.

## Troubleshooting

### Build Failures

**Issue**: `npm ci` fails during build
```bash
# Clear Docker build cache
docker builder prune -a
```

**Issue**: Shared packages not found
```bash
# Ensure you're building from project root
cd /path/to/commercesphere
docker build -f services/auth/Dockerfile .
```

### Runtime Issues

**Issue**: Service fails health check
```bash
# Check service logs
docker logs <container-name>

# Verify environment variables
docker inspect <container-name> | grep -A 20 Env
```

**Issue**: Cannot connect to database
```bash
# Ensure database is accessible from container
docker exec -it <container-name> ping postgres-host
```

## Production Considerations

### Security
- Never include secrets in Dockerfile
- Use Docker secrets or environment variables
- Run containers as non-root user (add USER directive)
- Scan images for vulnerabilities: `docker scan commercesphere/auth-service`

### Performance
- Set resource limits in docker-compose.yml or Kubernetes
- Use read-only root filesystem where possible
- Enable Docker BuildKit for faster builds: `DOCKER_BUILDKIT=1 docker build ...`

### Monitoring
- All services expose health check endpoints
- Integrate with Prometheus for metrics
- Use centralized logging (ELK stack)

## CI/CD Integration

### GitHub Actions Example

```yaml
- name: Build Docker Image
  run: |
    docker build -f services/auth/Dockerfile \
      -t ${{ secrets.REGISTRY }}/auth-service:${{ github.sha }} \
      -t ${{ secrets.REGISTRY }}/auth-service:latest \
      .
    
- name: Push to Registry
  run: |
    docker push ${{ secrets.REGISTRY }}/auth-service:${{ github.sha }}
    docker push ${{ secrets.REGISTRY }}/auth-service:latest
```

## Additional Resources

- [Docker Best Practices](https://docs.docker.com/develop/dev-best-practices/)
- [Multi-stage Builds](https://docs.docker.com/build/building/multi-stage/)
- [Docker Compose Documentation](https://docs.docker.com/compose/)
