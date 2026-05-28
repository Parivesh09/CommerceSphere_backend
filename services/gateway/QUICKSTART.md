# API Gateway Quick Start

## Prerequisites

- Node.js 20+
- Redis running on localhost:6379
- Backend services running (optional for basic testing)

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` and configure:
- JWT_SECRET (must match auth service)
- REDIS_HOST and REDIS_PORT
- Backend service URLs

### 3. Build

```bash
npm run build
```

### 4. Start Redis

If not already running:

```bash
docker run -d -p 6379:6379 redis:7-alpine
```

### 5. Start Gateway

Development mode (with auto-reload):
```bash
npm run dev
```

Production mode:
```bash
npm start
```

### 6. Test

The gateway should now be running on http://localhost:3000

Test the health endpoint:
```bash
curl http://localhost:3000/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "service": "api-gateway"
}
```

Run the test script:
```bash
./test-gateway.sh
```

## Common Operations

### Check Logs

The gateway uses structured logging. All logs include correlation IDs for tracing.

### Test JWT Validation

1. Get a token from the auth service:
```bash
curl -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password"}'
```

2. Use the token with the gateway:
```bash
curl http://localhost:3000/orders \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

### Test Rate Limiting

Make 101 requests quickly:
```bash
for i in {1..101}; do
  curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/health
done
```

You should see `429` (Too Many Requests) after 100 requests.

### Monitor Rate Limits

Check Redis for rate limit keys:
```bash
redis-cli KEYS "rate_limit:*"
```

## Docker

### Build Image

```bash
docker build -t commercesphere/gateway:latest -f Dockerfile ../..
```

### Run Container

```bash
docker run -d \
  -p 3000:3000 \
  -e REDIS_HOST=host.docker.internal \
  -e JWT_SECRET=your-secret \
  commercesphere/gateway:latest
```

### Using Docker Compose

```bash
docker-compose up gateway
```

## Troubleshooting

### Gateway won't start

**Error**: `ECONNREFUSED` connecting to Redis

**Solution**: Ensure Redis is running:
```bash
docker ps | grep redis
```

If not running:
```bash
docker-compose up -d redis
```

### Rate limiting not working

**Check Redis connection**:
```bash
redis-cli ping
```

Should return `PONG`.

**Check Redis memory**:
```bash
redis-cli INFO memory
```

### JWT validation failing

**Verify JWT secret matches auth service**:
- Check `JWT_SECRET` in gateway `.env`
- Check `JWT_SECRET` in auth service `.env`
- They must be identical

**Check token format**:
```bash
# Decode JWT (without verification)
echo "YOUR_TOKEN" | cut -d. -f2 | base64 -d | jq
```

### Backend service unavailable

**Check service URLs**:
```bash
curl http://localhost:3001/health  # Auth service
curl http://localhost:3002/health  # Product service
# etc.
```

**Check gateway logs** for connection errors.

## Next Steps

1. **Start Backend Services**: Start the microservices that the gateway routes to
2. **Configure SSL**: Set up SSL certificates for HTTPS
3. **Set Up Monitoring**: Configure Prometheus metrics and Grafana dashboards
4. **Load Testing**: Use k6 or Apache JMeter to test under load
5. **Production Deployment**: Deploy to Kubernetes with multiple replicas

## Resources

- [Full Documentation](./README.md)
- [Implementation Details](./IMPLEMENTATION.md)
- [Test Script](./test-gateway.sh)
- [Environment Variables](./.env.example)

## Support

For issues or questions:
1. Check the logs for error messages
2. Review the troubleshooting section
3. Check Redis and backend service health
4. Verify environment configuration
