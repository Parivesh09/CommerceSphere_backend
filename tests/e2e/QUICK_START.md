# E2E Tests Quick Start Guide

## Prerequisites Check

Before running E2E tests, ensure you have:

- ✅ Docker Desktop installed and running
- ✅ Node.js 20+ installed
- ✅ At least 8GB RAM available
- ✅ At least 10GB free disk space

## Quick Start (5 Steps)

### 1. Navigate to E2E Test Directory

```bash
cd tests/e2e
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Build Service Images (First Time Only)

```bash
# From project root
cd ../..
docker-compose build

# Or build individually
docker build -t commercesphere/auth-service:test ./services/auth
docker build -t commercesphere/product-service:test ./services/product
docker build -t commercesphere/order-service:test ./services/order
docker build -t commercesphere/payment-service:test ./services/payment
docker build -t commercesphere/notification-service:test ./services/notification
docker build -t commercesphere/search-service:test ./services/search
docker build -t commercesphere/analytics-service:test ./services/analytics
docker build -t commercesphere/gateway:test ./services/gateway
```

### 4. Run Tests

```bash
cd tests/e2e
./run-tests.sh
```

### 5. View Results

Tests will run and display results. Green = passed, Red = failed.

## Run Specific Test

```bash
# User registration and login
./run-tests.sh --test user-registration-login.e2e.test.ts

# Product browsing and search
./run-tests.sh --test product-browsing-search.e2e.test.ts

# Complete purchase flow
./run-tests.sh --test complete-purchase-flow.e2e.test.ts

# Order tracking
./run-tests.sh --test order-tracking.e2e.test.ts

# Payment failure and compensation
./run-tests.sh --test payment-failure-compensation.e2e.test.ts
```

## Expected Output

```
╔════════════════════════════════════════════════════════════╗
║         CommerceSphere E2E Test Runner                    ║
╚════════════════════════════════════════════════════════════╝

Checking prerequisites...
✓ Docker is running
✓ Node.js is installed (v20.x.x)

Checking service Docker images...
✓ All service images available

Cleaning up existing test containers...
✓ Cleanup complete

╔════════════════════════════════════════════════════════════╗
║                    Running E2E Tests                      ║
╚════════════════════════════════════════════════════════════╝

Running all E2E tests...

 PASS  src/tests/user-registration-login.e2e.test.ts
 PASS  src/tests/product-browsing-search.e2e.test.ts
 PASS  src/tests/complete-purchase-flow.e2e.test.ts
 PASS  src/tests/order-tracking.e2e.test.ts
 PASS  src/tests/payment-failure-compensation.e2e.test.ts

Test Suites: 5 passed, 5 total
Tests:       60 passed, 60 total

╔════════════════════════════════════════════════════════════╗
║                  ✓ All Tests Passed!                      ║
╚════════════════════════════════════════════════════════════╝
```

## Troubleshooting

### Docker Not Running

**Error:** `Docker is not running`

**Solution:**
```bash
# Start Docker Desktop
# Wait for Docker to fully start
# Try again
```

### Out of Memory

**Error:** Tests fail with memory errors

**Solution:**
1. Open Docker Desktop
2. Go to Settings → Resources
3. Increase Memory to 8GB or more
4. Click "Apply & Restart"

### Port Conflicts

**Error:** `Port already in use`

**Solution:**
```bash
# Stop local services
brew services stop postgresql
brew services stop redis

# Or kill specific ports
lsof -ti:5432 | xargs kill -9
lsof -ti:6379 | xargs kill -9
```

### Images Not Found

**Error:** `Image not found: commercesphere/xxx-service:test`

**Solution:**
```bash
# Build all images
cd ../..
docker-compose build

# Or build specific service
docker build -t commercesphere/auth-service:test ./services/auth
```

### Tests Timeout

**Error:** Tests timeout during setup

**Solution:**
1. Increase Docker memory allocation
2. Close other applications
3. Pre-pull base images:
```bash
docker pull postgres:15-alpine
docker pull redis:7-alpine
docker pull confluentinc/cp-kafka:7.5.0
docker pull elasticsearch:8.11.0
```

## Test Duration

| Test Suite | Duration |
|------------|----------|
| User Registration & Login | ~3 minutes |
| Product Browsing & Search | ~5 minutes |
| Complete Purchase Flow | ~8 minutes |
| Order Tracking | ~7 minutes |
| Payment Failure & Compensation | ~10 minutes |
| **Total** | **~35 minutes** |

Note: First run takes longer due to container image downloads.

## What Gets Tested

### 1. User Registration & Login
- Account creation
- Authentication
- Token management
- Security

### 2. Product Browsing & Search
- Product catalog
- Search functionality
- Filters
- Fuzzy matching

### 3. Complete Purchase Flow
- End-to-end purchase
- Inventory management
- Payment processing
- Notifications

### 4. Order Tracking
- Order status updates
- Notifications
- Timeline tracking

### 5. Payment Failure & Compensation
- Saga pattern
- Compensation logic
- Inventory restoration
- Error handling

## Next Steps

After running tests:

1. **Review Results**: Check test output for any failures
2. **Check Logs**: If tests fail, check service logs
3. **Read Documentation**: See `README.md` for detailed information
4. **Add Tests**: Add new tests for new features
5. **CI/CD Integration**: Integrate tests into your pipeline

## Useful Commands

```bash
# Run all tests
npm test

# Run specific test file
npm test -- user-registration-login.e2e.test.ts

# Run with coverage
npm run test:coverage

# Clean up Docker resources
docker system prune -a

# View running containers
docker ps

# View container logs
docker logs <container-id>

# Stop all containers
docker stop $(docker ps -aq)
```

## Getting Help

- **Documentation**: See `README.md` for comprehensive guide
- **Test Summary**: See `E2E_TEST_SUMMARY.md` for implementation details
- **Integration Tests**: See `../integration/` for comparison
- **Service Docs**: See individual service README files

## Tips for Success

1. **Close Other Apps**: Free up memory before running tests
2. **Stable Network**: Ensure stable internet for image downloads
3. **First Run**: First run takes longer (image downloads)
4. **Subsequent Runs**: Much faster after images are cached
5. **Clean Up**: Run cleanup if tests fail to stop
6. **Patience**: E2E tests take time - this is normal

## Common Questions

**Q: Why do tests take so long?**
A: E2E tests start complete infrastructure (databases, services) and test real workflows with async operations.

**Q: Can I run tests in parallel?**
A: No, tests run sequentially to avoid resource conflicts and ensure isolation.

**Q: Do I need all services running?**
A: No, the test runner starts all services automatically.

**Q: What if a test fails?**
A: Check the error message, review service logs, and consult the troubleshooting guide.

**Q: Can I run tests in CI/CD?**
A: Yes, tests are designed for CI/CD integration. Ensure sufficient resources.

## Success!

If all tests pass, you'll see:

```
╔════════════════════════════════════════════════════════════╗
║                  ✓ All Tests Passed!                      ║
╚════════════════════════════════════════════════════════════╝
```

Congratulations! Your CommerceSphere platform is working correctly! 🎉
