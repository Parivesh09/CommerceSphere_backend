# Integration Tests Implementation Guide

## Overview

This document provides detailed information about the integration test implementation for CommerceSphere.

## Architecture

### Testcontainers Approach

The integration tests use Testcontainers to provide isolated, reproducible test environments:

1. **Infrastructure Containers**: PostgreSQL, Redis, Kafka, Elasticsearch
2. **Service Containers**: All microservices (Auth, Product, Order, Payment, etc.)
3. **API Gateway**: Routes requests to services

### Benefits

- **Isolation**: Each test run uses fresh containers
- **Reproducibility**: Same environment every time
- **Parallelization**: Tests can run in CI/CD without conflicts
- **Realistic**: Tests against real databases and message brokers
- **No Mocking**: Tests validate actual service interactions

## Test Container Lifecycle

### Startup Sequence

```
1. Start Infrastructure Containers (parallel)
   ├── PostgreSQL (5432)
   ├── Redis (6379)
   ├── Kafka (9093)
   └── Elasticsearch (9200)

2. Wait for Health Checks
   └── All containers must be healthy

3. Start Service Containers (sequential)
   ├── Auth Service (3001)
   ├── Product Service (3002)
   ├── Order Service (3003)
   ├── Payment Service (3004)
   ├── Notification Service (3005)
   ├── Search Service (3006)
   ├── Analytics Service (3007)
   └── API Gateway (3000)

4. Run Tests
   └── Tests execute against API Gateway

5. Cleanup
   ├── Stop Service Containers
   ├── Stop Infrastructure Containers
   └── Remove Volumes
```

### Timing

- Infrastructure startup: ~30-60 seconds
- Service startup: ~60-90 seconds
- Total startup: ~2-3 minutes
- Test execution: ~5-10 minutes per suite
- Cleanup: ~30 seconds

## Test Suites

### 1. Order Flow Test

**File**: `src/tests/order-flow.test.ts`

**Purpose**: Validates the complete order processing workflow from user registration to order confirmation.

**Steps**:
1. Register customer and admin users
2. Authenticate both users
3. Admin creates a product
4. Customer creates an order
5. Verify inventory reservation
6. Process payment
7. Verify order status updated to PAID
8. Verify inventory permanently deducted
9. Verify notification sent

**Key Validations**:
- User registration creates encrypted accounts (Property 1)
- Valid credentials produce valid tokens (Property 2)
- Product creation stores all data (Property 5)
- Order creation initializes correctly (Property 13)
- Order creation reserves inventory (Property 14)
- Successful payments publish success events (Property 17)
- Order events trigger notifications (Property 21)

**Requirements Validated**: 1.1, 1.2, 2.1, 4.1, 4.2, 4.3, 5.1, 5.2, 11.1, 11.3

### 2. Order Cancellation Test

**File**: `src/tests/order-cancellation.test.ts`

**Purpose**: Validates saga compensation when orders are cancelled.

**Steps**:
1. Create order and reserve inventory
2. Simulate payment failure
3. Verify compensation executes
4. Verify inventory released
5. Verify order status is CANCELLED
6. Test compensation idempotency
7. Verify cancellation notification
8. Verify new orders can use released inventory

**Key Validations**:
- Failed reservations trigger compensation (Property 15)
- Failed sagas execute compensation (Property 43)
- Compensation is idempotent (Property 44)
- Expired reservations release inventory (Property 79)

**Requirements Validated**: 4.4, 11.2, 11.4, 11.5, 20.3

### 3. Product Search Test

**File**: `src/tests/product-search.test.ts`

**Purpose**: Validates event-driven search indexing and search functionality.

**Steps**:
1. Admin creates multiple products
2. Wait for products to be indexed
3. Search for products by keyword
4. Test price range filters
5. Test fuzzy matching with typos
6. Update product and verify index updates
7. Test autocomplete suggestions
8. Test status filters

**Key Validations**:
- Search results match all filters (Property 10)
- Search results are relevance-ranked (Property 11)
- Fuzzy matching handles typos (Property 12)
- Events reach all subscribers (Property 37)

**Requirements Validated**: 2.3, 3.1, 3.2, 3.4, 3.5, 10.1

### 4. Notification Delivery Test

**File**: `src/tests/notification-delivery.test.ts`

**Purpose**: Validates the notification system across different order events.

**Steps**:
1. Create order and verify ORDER_CREATED notification
2. Process payment and verify PAYMENT_SUCCESS notification
3. Update order to SHIPPED and verify notification
4. Test notification channel preferences
5. Verify all notification types sent
6. Verify retry logic
7. Verify notification timestamps

**Key Validations**:
- Order events trigger notifications (Property 21)
- Notification channel preferences respected (Property 22)
- Failed notifications retry with backoff (Property 23)

**Requirements Validated**: 6.1, 6.2, 6.3, 6.4, 6.5

### 5. Recommendation Generation Test

**File**: `src/tests/recommendation-generation.test.ts`

**Purpose**: Validates the recommendation engine.

**Steps**:
1. Track product views
2. Complete purchases
3. Get personalized recommendations
4. Get trending products
5. Get similar products
6. Test recommendations for new users
7. Test collaborative filtering
8. Test content-based filtering

**Key Validations**:
- Product views are recorded (Property 24)
- Recommendations use purchase history (Property 25)
- Collaborative filtering applies user patterns (Property 26)
- Content-based recommendations match category (Property 27)

**Requirements Validated**: 7.1, 7.2, 7.3, 7.4, 7.5

### 6. Analytics Metrics Test

**File**: `src/tests/analytics-metrics.test.ts`

**Purpose**: Validates the analytics system.

**Steps**:
1. Get baseline metrics
2. Create and complete multiple orders
3. Verify order metrics updated
4. Verify revenue aggregation
5. Test sales analytics by time period
6. Verify product metrics
7. Verify customer metrics
8. Verify required statistics
9. Test real-time updates
10. Verify metrics persistence

**Key Validations**:
- Order events update metrics (Property 28)
- Sales analytics aggregate correctly (Property 29)
- Metrics include required statistics (Property 30)
- Reports include customer insights (Property 31)
- Metrics are persisted (Property 32)

**Requirements Validated**: 8.1, 8.2, 8.3, 8.4, 8.5

## Helper Functions

### TestContainerManager

Manages infrastructure containers (PostgreSQL, Redis, Kafka, Elasticsearch).

```typescript
const containerManager = new TestContainerManager();
const containers = await containerManager.startAll();
const connections = containerManager.getConnectionStrings();
await containerManager.stopAll();
```

### TestServiceManager

Manages service containers (Auth, Product, Order, etc.).

```typescript
const serviceManager = new TestServiceManager();
const services = await serviceManager.startAll(containers);
const urls = serviceManager.getServiceUrls();
await serviceManager.stopAll();
```

### ApiClient

HTTP client wrapper with authentication support.

```typescript
const apiClient = new ApiClient(baseURL);
apiClient.setAuthToken(token);
const response = await apiClient.get('/endpoint');
const response = await apiClient.post('/endpoint', data);
```

### TestDataFactory

Generates test data with realistic values.

```typescript
const user = TestDataFactory.createUser();
const admin = TestDataFactory.createAdminUser();
const product = TestDataFactory.createProduct({ price: 99.99 });
const order = TestDataFactory.createOrder(userId, [productId]);
```

### waitForCondition

Polls a condition until it's true or timeout.

```typescript
const success = await waitForCondition(async () => {
  const response = await apiClient.get('/status');
  return response.data.status === 'COMPLETED';
}, 10000); // 10 second timeout
```

## Running Tests Locally

### Prerequisites

1. Install Docker Desktop
2. Allocate at least 8GB RAM to Docker
3. Install Node.js 20+
4. Build service Docker images

### Build Service Images

```bash
# Build all service images with 'test' tag
docker build -t commercesphere/auth-service:test services/auth
docker build -t commercesphere/product-service:test services/product
docker build -t commercesphere/order-service:test services/order
docker build -t commercesphere/payment-service:test services/payment
docker build -t commercesphere/notification-service:test services/notification
docker build -t commercesphere/search-service:test services/search
docker build -t commercesphere/analytics-service:test services/analytics
docker build -t commercesphere/gateway:test services/gateway
```

### Run Tests

```bash
cd tests/integration
npm install
./run-tests.sh
```

## CI/CD Integration

### GitHub Actions

```yaml
name: Integration Tests

on: [push, pull_request]

jobs:
  integration-tests:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v2
      
      - name: Build service images
        run: |
          docker build -t commercesphere/auth-service:test services/auth
          # ... build other services
      
      - name: Run integration tests
        run: |
          cd tests/integration
          npm install
          npm test
```

## Performance Considerations

### Resource Usage

- **Memory**: ~6-8GB during test execution
- **CPU**: 4+ cores recommended
- **Disk**: ~10GB for images and containers
- **Network**: Containers communicate via Docker network

### Optimization Tips

1. **Pre-pull Images**: Pull base images before running tests
2. **Parallel Tests**: Run test suites in parallel (with caution)
3. **Reuse Containers**: Consider reusing containers across tests (trade-off: isolation)
4. **Cleanup**: Always clean up containers to free resources

## Debugging

### View Container Logs

```bash
# List running containers
docker ps

# View logs for specific container
docker logs <container-id>

# Follow logs
docker logs -f <container-id>
```

### Connect to Container

```bash
# Execute shell in container
docker exec -it <container-id> /bin/sh

# Connect to PostgreSQL
docker exec -it <postgres-container-id> psql -U test -d commercesphere_test
```

### Debug Test Failures

1. Check test output for error messages
2. Review service logs for errors
3. Verify container health: `docker ps`
4. Check network connectivity between containers
5. Verify environment variables are set correctly

## Future Enhancements

### Planned Improvements

1. **Performance Tests**: Add load testing with k6
2. **Chaos Testing**: Simulate service failures
3. **Security Tests**: Add security scanning
4. **Contract Tests**: Add Pact contract testing
5. **Visual Tests**: Add screenshot comparison for UI

### Test Coverage Goals

- Integration test coverage: 80%+
- Critical path coverage: 100%
- Error scenario coverage: 70%+

## Contributing

### Adding New Tests

1. Create test file in `src/tests/`
2. Follow existing test structure
3. Use helper functions for common operations
4. Document what the test validates
5. Update README with test description

### Test Naming Convention

- File: `<feature>-<scenario>.test.ts`
- Describe block: `<Feature> Integration Test`
- Test: `Step N: <action and verification>`

### Code Review Checklist

- [ ] Test is independent and isolated
- [ ] Test uses TestDataFactory for data
- [ ] Test has proper cleanup
- [ ] Test validates specific requirements
- [ ] Test has clear assertions
- [ ] Test handles async operations correctly
- [ ] Test has appropriate timeouts
- [ ] Test is documented

## Support

For issues or questions:
1. Check troubleshooting section in README
2. Review container logs
3. Check GitHub issues
4. Contact the team
