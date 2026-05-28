# Integration Tests Quick Start

## TL;DR

```bash
# 1. Ensure Docker is running
docker info

# 2. Build service images (one-time setup)
make build-test-images

# 3. Run integration tests
cd tests/integration
./run-tests.sh
```

## What These Tests Do

The integration tests validate the complete CommerceSphere platform by:

1. **Starting Real Infrastructure**: PostgreSQL, Redis, Kafka, Elasticsearch
2. **Starting All Services**: Auth, Product, Order, Payment, Notification, Search, Analytics
3. **Running End-to-End Scenarios**: Complete workflows from user registration to order fulfillment
4. **Cleaning Up**: Automatically stops and removes all containers

## Test Suites

| Test Suite | Duration | What It Tests |
|------------|----------|---------------|
| Order Flow | ~3 min | Complete order: register → create product → order → pay → confirm |
| Order Cancellation | ~2 min | Saga compensation: order → payment fails → inventory released |
| Product Search | ~2 min | Event-driven indexing: create product → search → filters |
| Notification Delivery | ~2 min | Notifications: order events → email/SMS/push |
| Recommendation Generation | ~2 min | Recommendations: views → purchases → personalized |
| Analytics Metrics | ~3 min | Analytics: orders → metrics → aggregation |

**Total Runtime**: ~15-20 minutes for all tests

## Prerequisites

### Required

- ✅ Docker Desktop installed and running
- ✅ Docker allocated at least 8GB RAM
- ✅ Node.js 20+ installed
- ✅ At least 20GB free disk space

### Check Prerequisites

```bash
# Check Docker
docker --version
docker info | grep "Total Memory"

# Check Node.js
node --version

# Check disk space
df -h
```

## First Time Setup

### 1. Build Service Images

You need to build Docker images for all services with the `test` tag:

```bash
# Option 1: Use Makefile (if available)
make build-test-images

# Option 2: Build manually
docker build -t commercesphere/auth-service:test services/auth
docker build -t commercesphere/product-service:test services/product
docker build -t commercesphere/order-service:test services/order
docker build -t commercesphere/payment-service:test services/payment
docker build -t commercesphere/notification-service:test services/notification
docker build -t commercesphere/search-service:test services/search
docker build -t commercesphere/analytics-service:test services/analytics
docker build -t commercesphere/gateway:test services/gateway
```

### 2. Install Test Dependencies

```bash
cd tests/integration
npm install
```

## Running Tests

### Run All Tests

```bash
cd tests/integration
./run-tests.sh
```

### Run Specific Test

```bash
./run-tests.sh --test order-flow.test.ts
```

### Run with Verbose Output

```bash
./run-tests.sh --verbose
```

## What to Expect

### Console Output

```
=========================================
CommerceSphere Integration Tests
=========================================

Starting integration tests...
Note: This will start Docker containers and may take several minutes.

Starting test containers...
Starting PostgreSQL...
Starting Redis...
Starting Kafka...
Starting Elasticsearch...
All test containers started successfully

Starting test services...
Starting Auth Service...
Starting Product Service...
...
All test services started successfully

PASS src/tests/order-flow.test.ts
  Complete Order Flow Integration Test
    ✓ Step 1: Register and authenticate customer user (1234ms)
    ✓ Step 2: Register and authenticate admin user (987ms)
    ...

Test Suites: 6 passed, 6 total
Tests:       54 passed, 54 total
Time:        15m 32s

=========================================
Integration tests completed!
=========================================
```

### Timeline

1. **Container Startup** (2-3 minutes)
   - Infrastructure containers start
   - Services build and start
   - Health checks pass

2. **Test Execution** (12-15 minutes)
   - Tests run sequentially
   - Each test validates specific workflows
   - Progress shown in console

3. **Cleanup** (30 seconds)
   - Containers stopped
   - Resources cleaned up

## Troubleshooting

### "Docker is not running"

```bash
# Start Docker Desktop
# Wait for Docker to fully start
docker info
```

### "Cannot connect to Docker daemon"

```bash
# On Linux, add user to docker group
sudo usermod -aG docker $USER
# Log out and back in
```

### "Out of memory" or "Container failed to start"

```bash
# Increase Docker memory in Docker Desktop settings
# Recommended: 8GB minimum

# Or stop other containers
docker stop $(docker ps -q)
```

### "Port already in use"

```bash
# Stop local services that might conflict
# PostgreSQL, Redis, Kafka, etc.

# Or clean up zombie containers
docker stop $(docker ps -aq)
docker rm $(docker ps -aq)
```

### Tests Fail with Timeout

```bash
# Increase timeout in test files
# Or check service logs
docker logs <container-id>
```

### Clean Up Everything

```bash
# Stop all containers
docker stop $(docker ps -aq)

# Remove all containers
docker rm $(docker ps -aq)

# Remove all volumes
docker volume prune -f

# Remove all networks
docker network prune -f
```

## CI/CD Integration

### GitHub Actions

Add to `.github/workflows/integration-tests.yml`:

```yaml
name: Integration Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
      - name: Build images
        run: make build-test-images
      - name: Run tests
        run: |
          cd tests/integration
          npm install
          npm test
```

## Next Steps

1. **Review Test Results**: Check which tests passed/failed
2. **View Logs**: Use `docker logs` to debug failures
3. **Add New Tests**: Follow patterns in existing tests
4. **Run in CI**: Integrate with your CI/CD pipeline

## Getting Help

- 📖 Read [README.md](./README.md) for detailed documentation
- 📚 Check [IMPLEMENTATION_GUIDE.md](./IMPLEMENTATION_GUIDE.md) for architecture details
- 🐛 Report issues on GitHub
- 💬 Ask questions in team chat

## Tips

- **First run is slow**: Docker needs to pull images
- **Subsequent runs are faster**: Images are cached
- **Run tests before commits**: Catch issues early
- **Check Docker resources**: Monitor memory/CPU usage
- **Clean up regularly**: Remove old containers/images
