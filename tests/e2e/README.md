# End-to-End Tests

This directory contains end-to-end (E2E) tests for the CommerceSphere platform. E2E tests validate complete user journeys from a customer's perspective, testing the entire system with all services running.

## Overview

E2E tests differ from integration tests in that they:
- Test complete user workflows from start to finish
- Validate the system from a user's perspective
- Test real-world scenarios and user journeys
- Ensure all services work together correctly

## Test Suites

### 1. User Registration and Login (`user-registration-login.e2e.test.ts`)

Tests the complete authentication flow:
- New user registration with validation
- Duplicate email prevention
- Login with valid/invalid credentials
- Token-based authentication
- Access to protected resources
- Token refresh mechanism
- Logout and token invalidation
- Password encryption verification

**Validates Requirements:** 1.1, 1.2, 1.3, 19.1

### 2. Product Browsing and Search (`product-browsing-search.e2e.test.ts`)

Tests the product discovery experience:
- Admin product creation
- Automatic search indexing
- Product catalog browsing
- Full-text search with relevance ranking
- Filter by price range
- Filter by category
- Combined filters
- Product detail viewing
- Fuzzy matching for typos
- Autocomplete suggestions
- Pagination

**Validates Requirements:** 2.1, 2.3, 3.1, 3.2, 3.3, 3.4, 3.5

### 3. Complete Purchase Flow (`complete-purchase-flow.e2e.test.ts`)

Tests the end-to-end purchase journey:
- Customer registration and login
- Product browsing
- Order creation
- Inventory reservation
- Payment processing
- Order confirmation
- Permanent inventory deduction
- Order confirmation notification
- Order history viewing
- Analytics recording

**Validates Requirements:** 1.1, 1.2, 2.1, 2.2, 4.1, 4.2, 4.3, 5.1, 5.2, 6.1, 6.2, 11.1, 11.3, 20.1, 20.4

### 4. Order Tracking (`order-tracking.e2e.test.ts`)

Tests the order tracking experience:
- Order creation
- Real-time status tracking
- Order history viewing
- Status progression (CREATED → PAID → PROCESSING → SHIPPED → DELIVERED)
- Notifications at each stage
- Tracking number display
- Complete order timeline
- Chronological notification ordering

**Validates Requirements:** 4.1, 4.5, 6.1, 6.2, 6.3

### 5. Payment Failure and Compensation (`payment-failure-compensation.e2e.test.ts`)

Tests the saga compensation flow:
- Order creation with inventory reservation
- Payment failure simulation
- Automatic compensation execution
- Inventory restoration
- Order cancellation
- Cancellation notification
- Idempotent compensation
- Recovery with successful order
- Reservation expiration (15 minutes)

**Validates Requirements:** 4.4, 5.3, 6.1, 11.2, 11.4, 11.5, 20.3

## Prerequisites

- Docker installed and running
- Node.js 20+ installed
- At least 8GB RAM available for containers
- Sufficient disk space for Docker images (~10GB)
- All service Docker images built

## Building Service Images

Before running E2E tests, build all service images:

```bash
# From project root
docker-compose build

# Or build individual services
docker build -t commercesphere/auth-service:test ./services/auth
docker build -t commercesphere/product-service:test ./services/product
docker build -t commercesphere/order-service:test ./services/order
docker build -t commercesphere/payment-service:test ./services/payment
docker build -t commercesphere/notification-service:test ./services/notification
docker build -t commercesphere/search-service:test ./services/search
docker build -t commercesphere/analytics-service:test ./services/analytics
docker build -t commercesphere/gateway:test ./services/gateway
```

## Running Tests

### Install Dependencies

```bash
cd tests/e2e
npm install
```

### Run All E2E Tests

```bash
npm test
```

### Run Specific Test Suite

```bash
npm test -- user-registration-login.e2e.test.ts
npm test -- product-browsing-search.e2e.test.ts
npm test -- complete-purchase-flow.e2e.test.ts
npm test -- order-tracking.e2e.test.ts
npm test -- payment-failure-compensation.e2e.test.ts
```

### Run with Coverage

```bash
npm run test:coverage
```

## Test Execution Flow

1. **Environment Setup** (2-3 minutes)
   - Start PostgreSQL, Redis, Kafka, Elasticsearch containers
   - Start all microservices with health checks
   - Initialize API clients

2. **Test Execution** (10-15 minutes per suite)
   - Tests run sequentially within each suite
   - Each test builds on previous state
   - Realistic delays for async operations

3. **Cleanup** (30-60 seconds)
   - Stop all service containers
   - Stop infrastructure containers
   - Clean up resources

## Test Structure

Each E2E test follows this pattern:

```typescript
describe('E2E: Feature Name', () => {
  let envManager: E2EEnvironmentManager;
  let apiClient: ApiClient;

  beforeAll(async () => {

    envManager = new E2EEnvironmentManager();
    const env = await envManager.setup();
    apiClient = env.apiClient;
  }, 180000); // 3 minute timeout

  afterAll(async () => {

    await envManager?.teardown();
  }, 60000);

  test('Step 1: User action', async () => {

  });


});
```

## Best Practices

1. **Sequential Steps**: E2E tests have sequential steps that build on each other
2. **Realistic Data**: Use realistic test data that mimics production scenarios
3. **Wait for Async**: Use `waitForCondition` for async operations (events, notifications)
4. **User Perspective**: Test from the user's point of view, not internal implementation
5. **Complete Flows**: Test entire workflows from start to finish
6. **Error Scenarios**: Include both success and failure paths
7. **Cleanup**: Always clean up resources in `afterAll`

## Configuration

### Timeouts

- Environment setup: 180 seconds (3 minutes)
- Individual tests: 120 seconds (2 minutes)
- Async conditions: 15-20 seconds
- Cleanup: 60 seconds (1 minute)

### Environment Variables

```bash
# Optional: Override default timeouts
export TEST_TIMEOUT=120000
export CONTAINER_STARTUP_TIMEOUT=180000

# Optional: Enable debug logging
export LOG_LEVEL=debug
export DEBUG=testcontainers*
```

## Troubleshooting

### Tests Timeout During Setup

**Problem:** Environment setup takes too long

**Solutions:**
- Increase Docker memory allocation (8GB minimum)
- Pre-pull Docker images
- Check Docker daemon logs
- Ensure no port conflicts

### Service Health Checks Fail

**Problem:** Services don't start properly

**Solutions:**
- Check service logs: `docker logs <container-id>`
- Verify all environment variables are set
- Ensure database migrations completed
- Check for missing dependencies

### Tests Fail Intermittently

**Problem:** Tests pass sometimes but fail other times

**Solutions:**
- Increase wait timeouts in `waitForCondition`
- Check for race conditions
- Verify event processing delays
- Review service logs for errors

### Out of Memory

**Problem:** Docker runs out of memory

**Solutions:**
- Increase Docker memory limit (8GB recommended)
- Run fewer tests in parallel
- Close other applications
- Clean up unused Docker resources

### Port Conflicts

**Problem:** Ports already in use

**Solutions:**
- Stop local services (PostgreSQL, Redis, etc.)
- Check for zombie containers: `docker ps -a`
- Clean up: `docker stop $(docker ps -aq)`

## CI/CD Integration

E2E tests run in the CI/CD pipeline:

1. After all services are built
2. Before staging deployment
3. After staging deployment (smoke tests)
4. Before production deployment

See `.github/workflows/` for pipeline configuration.

## Differences from Integration Tests

| Aspect | Integration Tests | E2E Tests |
|--------|------------------|-----------|
| Scope | Service interactions | Complete user journeys |
| Perspective | Technical/Internal | User/External |
| Duration | 5-10 minutes | 10-15 minutes |
| Focus | Component integration | User workflows |
| Data | Minimal test data | Realistic scenarios |
| Assertions | Technical correctness | User experience |

## Writing New E2E Tests

When adding new E2E tests:

1. **Identify User Journey**: What complete workflow are you testing?
2. **Define Steps**: Break down the journey into sequential steps
3. **Setup Environment**: Use `E2EEnvironmentManager` for consistent setup
4. **Use Helpers**: Leverage `ApiClient` and `TestDataFactory`
5. **Wait for Async**: Use `waitForCondition` for event-driven operations
6. **Verify User Experience**: Test what users see and experience
7. **Document Requirements**: Link to specific requirements being validated

Example:

```typescript
/**
 * E2E Test: Feature Name
 * 
 * Tests the complete [feature] flow from a user's perspective:
 * 1. Step one
 * 2. Step two
 * ...
 * 
 * Validates Requirements: X.Y, Z.W
 */
describe('E2E: Feature Name', () => {

});
```

## Performance Considerations

E2E tests are slower than unit or integration tests because they:
- Start complete infrastructure (databases, message brokers)
- Start all microservices
- Test real async operations (events, notifications)
- Wait for eventual consistency

This is expected and necessary for validating real-world behavior.

## Maintenance

- Update tests when user workflows change
- Keep test data realistic and up-to-date
- Review and update timeouts as system performance changes
- Add new tests for new user-facing features
- Remove or update tests for deprecated features

## Support

For issues or questions:
1. Check troubleshooting section above
2. Review service logs: `docker logs <container-id>`
3. Check test output for specific error messages
4. Verify all prerequisites are met
5. Consult integration test documentation for comparison
