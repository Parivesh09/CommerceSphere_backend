# API Gateway Service

The API Gateway is the single entry point for all client requests to the CommerceSphere microservices platform. It handles routing, authentication, rate limiting, and request logging.

## Features

- **Request Routing**: Routes requests to appropriate microservices based on path prefix
- **JWT Validation**: Validates JWT tokens for protected endpoints
- **Rate Limiting**: Implements sliding window rate limiting (100 requests/minute per user) using Redis
- **Request Logging**: Logs all requests with correlation IDs for distributed tracing
- **SSL Termination**: Supports HTTPS with configurable SSL certificates
- **CORS & Security**: Implements CORS and security headers using Helmet

## Architecture

The gateway uses Express.js with http-proxy-middleware to forward requests to backend services. It applies middleware in the following order:

1. **Correlation ID**: Generates or extracts correlation ID for request tracing
2. **Request Logger**: Logs incoming requests with metadata
3. **Rate Limiter**: Enforces rate limits using Redis
4. **JWT Validation**: Validates authentication tokens (per route)
5. **Proxy**: Forwards request to target service

## Routes

| Path | Target Service | Authentication |
|------|---------------|----------------|
| `/auth/*` | Auth Service | None |
| `/products/*` | Product Service | Optional |
| `/orders/*` | Order Service | Required |
| `/payments/*` | Payment Service | Required |
| `/notifications/*` | Notification Service | Required |
| `/search/*` | Search Service | None |
| `/recommendations/*` | Recommendation Service | Optional |
| `/analytics/*` | Analytics Service | Required |

## Configuration

Environment variables:

```bash
PORT=3000
JWT_SECRET=your-secret-key
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# Service URLs
AUTH_SERVICE_URL=http://localhost:3001
PRODUCT_SERVICE_URL=http://localhost:3002
ORDER_SERVICE_URL=http://localhost:3003
PAYMENT_SERVICE_URL=http://localhost:3004
NOTIFICATION_SERVICE_URL=http://localhost:3005
SEARCH_SERVICE_URL=http://localhost:3006
RECOMMENDATION_SERVICE_URL=http://localhost:3007
ANALYTICS_SERVICE_URL=http://localhost:3008

# SSL (optional)
SSL_ENABLED=false
SSL_CERT_PATH=/path/to/cert.pem
SSL_KEY_PATH=/path/to/key.pem
```

## Rate Limiting

The gateway implements a sliding window rate limiter using Redis sorted sets:

- **Limit**: 100 requests per minute per user
- **Window**: 60 seconds (sliding)
- **Identifier**: User ID (if authenticated) or IP address
- **Response**: HTTP 429 with retry information

Rate limit headers are included in all responses:
- `X-RateLimit-Limit`: Maximum requests allowed
- `X-RateLimit-Remaining`: Requests remaining in current window
- `X-RateLimit-Reset`: Unix timestamp when the window resets

## JWT Validation

Protected endpoints require a valid JWT token in the Authorization header:

```
Authorization: Bearer <token>
```

The gateway validates:
- Token signature using the configured JWT secret
- Token expiration
- Token structure

On successful validation, user information is forwarded to backend services via headers:
- `X-User-ID`: User's unique identifier
- `X-User-Email`: User's email address
- `X-User-Role`: User's role (customer, admin, etc.)

## Correlation IDs

Every request is assigned a correlation ID for distributed tracing:

- If the client provides `X-Correlation-ID` header, it's used
- Otherwise, a new UUID is generated
- The correlation ID is:
  - Returned in the response header
  - Forwarded to backend services
  - Included in all log entries

## Error Responses

All errors follow a consistent format:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "timestamp": "2024-01-15T10:30:00.000Z",
    "path": "/api/endpoint",
    "correlationId": "abc-123-def",
    "details": {}
  }
}
```

Common error codes:
- `UNAUTHORIZED`: Missing or invalid authentication
- `RATE_LIMIT_EXCEEDED`: Too many requests
- `SERVICE_UNAVAILABLE`: Backend service unavailable
- `NOT_FOUND`: Endpoint does not exist
- `INTERNAL_ERROR`: Unexpected server error

## Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

## Health Check

The gateway exposes a health check endpoint:

```
GET /health
```

Response:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "service": "api-gateway"
}
```

## Monitoring

Key metrics to monitor:
- Request rate per endpoint
- Error rate per endpoint
- Response time (p50, p95, p99)
- Rate limit rejections
- JWT validation failures
- Backend service availability

## Security

The gateway implements several security measures:

- **Helmet**: Sets security-related HTTP headers
- **CORS**: Configurable cross-origin resource sharing
- **Rate Limiting**: Prevents abuse and DDoS attacks
- **JWT Validation**: Ensures authenticated access to protected resources
- **SSL/TLS**: Optional HTTPS support
- **Input Validation**: Validates and sanitizes all inputs (handled by backend services)

## Deployment

The gateway should be deployed as a highly available service:

- Multiple replicas for load distribution
- Health checks for automatic failover
- Horizontal scaling based on traffic
- SSL termination at the gateway level
- Connection pooling to Redis

## Troubleshooting

**Rate limiter not working:**
- Verify Redis connection
- Check Redis logs for errors
- Ensure Redis has sufficient memory

**JWT validation failing:**
- Verify JWT_SECRET matches auth service
- Check token expiration
- Ensure token format is correct

**Backend service unavailable:**
- Check service URLs in configuration
- Verify backend services are running
- Check network connectivity
