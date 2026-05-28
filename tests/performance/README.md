# Performance Tests

This directory contains performance and load tests for the CommerceSphere platform using k6.

## Structure

```
tests/performance/
├── README.md
├── load-test.js          # Main load test script
├── stress-test.js        # Stress test script
├── spike-test.js         # Spike test script
├── soak-test.js          # Endurance/soak test script
└── scenarios/            # Test scenarios
    ├── browse-products.js
    ├── search-products.js
    ├── create-order.js
    └── complete-purchase.js
```

## Prerequisites

### Install k6

**macOS:**
```bash
brew install k6
```

**Linux:**
```bash
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install k6
```

**Windows:**
```bash
choco install k6
```

## Running Tests

### Load Test

Simulates normal load conditions:

```bash
# Run against staging
k6 run tests/performance/load-test.js

# Run with custom parameters
k6 run --vus 100 --duration 5m tests/performance/load-test.js

# Run with environment variables
API_BASE_URL=https://staging-api.commercesphere.example.com k6 run tests/performance/load-test.js
```

### Stress Test

Finds system breaking point:

```bash
k6 run tests/performance/stress-test.js
```

### Spike Test

Tests sudden traffic spikes:

```bash
k6 run tests/performance/spike-test.js
```

### Soak Test

Tests system stability over time:

```bash
k6 run tests/performance/soak-test.js
```

## Test Scenarios

### Load Test Configuration

```javascript

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const errorRate = new Rate('errors');
const BASE_URL = __ENV.API_BASE_URL || 'https://staging-api.commercesphere.example.com';

export const options = {
  stages: [
    { duration: '2m', target: 100 },  // Ramp up to 100 users
    { duration: '5m', target: 100 },  // Stay at 100 users
    { duration: '2m', target: 200 },  // Ramp up to 200 users
    { duration: '5m', target: 200 },  // Stay at 200 users
    { duration: '2m', target: 0 },    // Ramp down to 0 users
  ],
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1000'],  // 95% < 500ms, 99% < 1000ms
    http_req_failed: ['rate<0.05'],                   // Error rate < 5%
    errors: ['rate<0.05'],
  },
};

export default function () {

  let response = http.get(`${BASE_URL}/products?limit=20`);
  check(response, {
    'products list status is 200': (r) => r.status === 200,
    'products list has data': (r) => r.json('products') !== undefined,
  }) || errorRate.add(1);

  sleep(1);


  response = http.get(`${BASE_URL}/search?q=laptop`);
  check(response, {
    'search status is 200': (r) => r.status === 200,
    'search has results': (r) => r.json('results') !== undefined,
  }) || errorRate.add(1);

  sleep(1);


  response = http.get(`${BASE_URL}/products/1`);
  check(response, {
    'product details status is 200 or 404': (r) => r.status === 200 || r.status === 404,
  }) || errorRate.add(1);

  sleep(2);
}
```

## Performance Targets

### Response Time Targets

| Endpoint | p50 | p95 | p99 |
|----------|-----|-----|-----|
| GET /products | < 100ms | < 300ms | < 500ms |
| GET /search | < 150ms | < 300ms | < 500ms |
| POST /orders | < 200ms | < 500ms | < 1000ms |
| POST /payments | < 300ms | < 800ms | < 1500ms |

### Throughput Targets

- **Minimum:** 1,000 requests/minute
- **Target:** 10,000 requests/minute
- **Peak:** 50,000 requests/minute

### Concurrent Users

- **Normal Load:** 100-500 concurrent users
- **Peak Load:** 1,000-2,000 concurrent users
- **Stress Test:** 5,000+ concurrent users

## Metrics

### Key Metrics Collected

1. **Response Time:**
   - Average (mean)
   - Median (p50)
   - 95th percentile (p95)
   - 99th percentile (p99)
   - Maximum

2. **Throughput:**
   - Requests per second
   - Data transferred per second

3. **Error Rate:**
   - HTTP errors (4xx, 5xx)
   - Network errors
   - Timeout errors

4. **Resource Utilization:**
   - CPU usage
   - Memory usage
   - Network bandwidth

## Analyzing Results

### k6 Output

```
     ✓ products list status is 200
     ✓ products list has data
     ✓ search status is 200
     ✓ search has results

     checks.........................: 100.00% ✓ 40000      ✗ 0
     data_received..................: 120 MB  400 kB/s
     data_sent......................: 4.0 MB  13 kB/s
     http_req_blocked...............: avg=1.2ms    min=0s       med=1ms      max=50ms     p(95)=3ms      p(99)=10ms
     http_req_connecting............: avg=800µs    min=0s       med=600µs    max=30ms     p(95)=2ms      p(99)=5ms
     http_req_duration..............: avg=150ms    min=50ms     med=120ms    max=2s       p(95)=300ms    p(99)=500ms
     http_req_failed................: 0.00%   ✓ 0          ✗ 10000
     http_req_receiving.............: avg=500µs    min=100µs    med=400µs    max=10ms     p(95)=1ms      p(99)=2ms
     http_req_sending...............: avg=200µs    min=50µs     med=150µs    max=5ms      p(95)=400µs    p(99)=800µs
     http_req_tls_handshaking.......: avg=0s       min=0s       med=0s       max=0s       p(95)=0s       p(99)=0s
     http_req_waiting...............: avg=149ms    min=49ms     med=119ms    max=1.99s    p(95)=299ms    p(99)=499ms
     http_reqs......................: 10000   33.33/s
     iteration_duration.............: avg=5.15s    min=5s       med=5.12s    max=7s       p(95)=5.3s     p(99)=5.5s
     iterations.....................: 2000    6.67/s
     vus............................: 100     min=0        max=200
     vus_max........................: 200     min=200      max=200
```

### Interpreting Results

✅ **Good Performance:**
- p95 < 500ms
- p99 < 1000ms
- Error rate < 1%
- Throughput meets targets

⚠️ **Degraded Performance:**
- p95 > 500ms
- p99 > 1000ms
- Error rate 1-5%
- Throughput below target

❌ **Poor Performance:**
- p95 > 1000ms
- p99 > 2000ms
- Error rate > 5%
- Frequent timeouts

## Optimization Tips

### If Response Times Are High

1. **Check database queries:**
   - Add indexes
   - Optimize queries
   - Use connection pooling

2. **Improve caching:**
   - Increase cache hit rate
   - Optimize cache TTL
   - Use CDN for static assets

3. **Scale horizontally:**
   - Add more pods
   - Increase HPA limits
   - Distribute load

### If Error Rate Is High

1. **Check logs:**
   - Application errors
   - Database errors
   - Network errors

2. **Verify resources:**
   - CPU limits
   - Memory limits
   - Database connections

3. **Review rate limits:**
   - API Gateway limits
   - Database connection limits
   - External service limits

## CI/CD Integration

Performance tests run automatically:

1. After staging deployment
2. Before production deployment
3. On schedule (nightly)

See `.github/workflows/cd-staging.yml` for configuration.

## Best Practices

1. **Run tests regularly:** Weekly or after major changes
2. **Baseline metrics:** Establish performance baselines
3. **Monitor trends:** Track performance over time
4. **Test realistic scenarios:** Use production-like data
5. **Isolate tests:** Run on dedicated environment
6. **Document results:** Keep performance test reports
7. **Set alerts:** Alert on performance degradation

## Troubleshooting

### Tests Fail to Start

- Check k6 installation
- Verify API base URL
- Check network connectivity

### High Error Rates

- Check service health
- Verify rate limits
- Check database connections

### Inconsistent Results

- Run multiple times
- Check system load
- Verify test isolation

## Resources

- [k6 Documentation](https://k6.io/docs/)
- [k6 Examples](https://k6.io/docs/examples/)
- [Performance Testing Guide](https://k6.io/docs/testing-guides/)
