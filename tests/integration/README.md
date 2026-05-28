# Integration Tests

This directory contains integration tests for the CommerceSphere platform using Testcontainers.

## Structure

```
tests/integration/
├── README.md
├── package.json          # Test dependencies
├── jest.config.js        # Jest configuration
├── tsconfig.json         # TypeScript configuration
├── run-tests.sh          # Test runner script
├── src/
│   ├── setup/            # Test container setup
│   │   ├── test-containers.ts    # Testcontainers management
│   │   └── test-services.ts      # Service container management
│   ├── helpers/          # Test helper functions
│   │   ├── api-client.ts         # HTTP client wrapper
│   │   └── test-data.ts          # Test data factories
│   └── tests/            # Test suites
│       ├── order-flow.test.ts              # Complete order flow
│       ├── order-cancellation.test.ts      # Saga compensation
│       ├── product-search.test.ts          # Search indexing
│       ├── notification-delivery.test.ts   # Notification system
│       ├── recommendation-generation.test.ts # Recommendations
│       └── analytics-metrics.test.ts       # Analytics updates
```

## Running Tests

### Prerequisites

- Docker installed and running
- Node.js 20+ installed
- At least 8GB RAM available for containers
- Sufficient disk space for Docker images

### Run All Tests

```bash
# Using the test runner script (recommended)
cd tests/integration
./run-tests.sh

# Or using npm directly
cd tests/integration
npm install
npm test
```

### Run Specific Test Suite

```bash
# Run specific test file
./run-tests.sh --test order-flow.test.ts

# Run with verbose output
./run-tests.sh --verbose

# Run specific test using npm
npm test -- src/tests/order-flow.test.ts
```

### Test Execution Flow

1. **Container Startup** (2-3 minutes)
   - PostgreSQL, Redis, Kafka, Elasticsearch containers start
   - Services build and start with health checks
   
2. **Test Execution** (5-10 minutes per suite)
   - Tests run sequentially to avoid resource conflicts
   - Each test suite is independent
   
3. **Cleanup** (30 seconds)
   - All containers stopped and removed
   - Resources cleaned up

## Writing Integration Tests

### Test Structure

```typescript
import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { TestContainerManager } from '../setup/test-containers';
import { TestServiceManager } from '../setup/test-services';
import { ApiClient } from '../helpers/api-client';
import { TestDataFactory, waitForCondition } from '../helpers/test-data';

describe('My Integration Test', () => {
  let containerManager: TestContainerManager;
  let serviceManager: TestServiceManager;
  let apiClient: ApiClient;

  beforeAll(async () => {

    containerManager = new TestContainerManager();
    const containers = await containerManager.startAll();

    serviceManager = new TestServiceManager();
    const services = await serviceManager.startAll(containers);
    const urls = serviceManager.getServiceUrls();

    apiClient = new ApiClient(urls.gateway);
  }, 120000); // 2 minute timeout

  afterAll(async () => {

    await serviceManager?.stopAll();
    await containerManager?.stopAll();
  }, 60000);

  test('should do something', async () => {

    const response = await apiClient.get('/endpoint');
    expect(response.status).toBe(200);
  });
});
```

### Using Test Helpers

```typescript

const user = TestDataFactory.createUser();
const product = TestDataFactory.createProduct({ price: 99.99 });
const order = TestDataFactory.createOrder(userId, [productId]);


const success = await waitForCondition(async () => {
  const response = await apiClient.get('/status');
  return response.data.status === 'COMPLETED';
}, 10000); // 10 second timeout


apiClient.setAuthToken(token);
const response = await apiClient.post('/orders', orderData);
```

## Test Suites

### 1. Complete Order Flow (`order-flow.test.ts`)

Tests the end-to-end order processing workflow:
- User registration and authentication
- Product creation by admin
- Order creation with inventory reservation
- Payment processing
- Order confirmation
- Notification delivery

**Validates Requirements:** 1.1, 1.2, 2.1, 4.1, 4.2, 4.3, 5.1, 5.2, 11.1, 11.3

### 2. Order Cancellation with Compensation (`order-cancellation.test.ts`)

Tests the saga compensation workflow:
- Order creation and inventory reservation
- Payment failure simulation
- Compensation execution (inventory release)
- Order status update to CANCELLED
- Idempotent compensation
- Cancellation notification

**Validates Requirements:** 4.4, 11.2, 11.4, 11.5, 20.3

### 3. Product Search After Creation (`product-search.test.ts`)

Tests event-driven search indexing:
- Product creation by admin
- Event publishing to Kafka
- Search service indexing
- Full-text search with relevance ranking
- Filter matching (price, category, status)
- Fuzzy matching for typos
- Search index updates

**Validates Requirements:** 2.3, 3.1, 3.2, 3.4, 3.5, 10.1

### 4. Notification Delivery (`notification-delivery.test.ts`)

Tests the notification system:
- Order created notifications
- Payment success notifications
- Order shipped notifications
- Notification channel preferences
- Retry logic for failures
- Notification timestamps

**Validates Requirements:** 6.1, 6.2, 6.3, 6.4, 6.5

### 5. Recommendation Generation (`recommendation-generation.test.ts`)

Tests the recommendation engine:
- Product view tracking
- Purchase history recording
- Personalized recommendations
- Trending products
- Similar product recommendations
- Collaborative filtering
- Content-based filtering

**Validates Requirements:** 7.1, 7.2, 7.3, 7.4, 7.5

### 6. Analytics Metrics Update (`analytics-metrics.test.ts`)

Tests the analytics system:
- Order event processing
- Revenue aggregation
- Sales analytics by time period
- Product metrics (views, purchases)
- Customer metrics (spending, lifetime value)
- Real-time metrics updates
- Metrics persistence

**Validates Requirements:** 8.1, 8.2, 8.3, 8.4, 8.5

## Best Practices

1. **Isolation:** Each test suite is independent with its own containers
2. **Cleanup:** Containers automatically cleaned up after tests
3. **Realistic Data:** Use TestDataFactory for consistent test data
4. **Error Cases:** Test both success and failure scenarios
5. **Timeouts:** Use waitForCondition for async operations
6. **Assertions:** Use clear, descriptive assertions
7. **Documentation:** Document what each test validates

## Configuration

### Environment Variables

```bash
# Optional: Override default timeouts
export TEST_TIMEOUT=60000           # Test timeout in ms
export CONTAINER_STARTUP_TIMEOUT=120000  # Container startup timeout

# Optional: Enable debug logging
export LOG_LEVEL=debug
export DEBUG=testcontainers*
```

### Docker Requirements

- Docker Engine 20.10+
- Docker Compose 2.0+ (optional)
- Minimum 8GB RAM allocated to Docker
- Minimum 20GB disk space

## Troubleshooting

### Tests Timeout During Container Startup

**Problem:** Containers take too long to start

**Solutions:**
- Increase Docker memory allocation (8GB recommended)
- Pull images beforehand: `docker pull postgres:15-alpine redis:7-alpine`
- Check Docker daemon logs for errors
- Ensure no port conflicts with existing services

### Out of Memory Errors

**Problem:** Docker runs out of memory

**Solutions:**
- Increase Docker memory limit in Docker Desktop settings
- Run fewer tests in parallel (tests already run serially)
- Close other applications to free up memory

### Port Already in Use

**Problem:** Container ports conflict with running services

**Solutions:**
- Stop local services (PostgreSQL, Redis, Kafka, etc.)
- Testcontainers uses random ports, but conflicts can still occur
- Check for zombie containers: `docker ps -a`

### Tests Fail Intermittently

**Problem:** Tests pass sometimes but fail other times

**Solutions:**
- Increase wait timeouts in `waitForCondition` calls
- Check for race conditions in async operations
- Verify event processing delays
- Review service logs for errors

### Container Cleanup Issues

**Problem:** Containers not cleaned up after tests

**Solutions:**
- Manually stop containers: `docker stop $(docker ps -aq)`
- Remove containers: `docker rm $(docker ps -aq)`
- Clean up volumes: `docker volume prune`
- Restart Docker daemon

### Service Health Check Failures

**Problem:** Services fail health checks during startup

**Solutions:**
- Check service logs: `docker logs <container-id>`
- Verify database migrations completed
- Ensure all environment variables are set correctly
- Check for missing dependencies in service images

## CI/CD Integration

Integration tests run automatically in the CD pipeline:

1. After staging deployment
2. Before production deployment
3. On manual trigger

See `.github/workflows/cd-staging.yml` for configuration.
