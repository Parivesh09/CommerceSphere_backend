# CommerceSphere Architecture

## Project Structure

```
commercesphere/
├── .kiro/                          # Kiro specifications
│   └── specs/
│       └── ecommerce-microservices-platform/
│           ├── requirements.md     # Feature requirements
│           ├── design.md          # System design
│           └── tasks.md           # Implementation tasks
│
├── services/                       # Microservices
│   ├── auth/                      # Authentication & Authorization
│   │   ├── src/
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── product/                   # Product Catalog & Inventory
│   ├── order/                     # Order Management & Saga
│   ├── payment/                   # Payment Processing
│   ├── notification/              # Multi-channel Notifications
│   ├── search/                    # Elasticsearch Search
│   ├── recommendation/            # ML Recommendations
│   └── analytics/                 # Business Analytics
│
├── shared/                        # Shared Packages
│   ├── types/                     # TypeScript Type Definitions
│   │   ├── src/
│   │   │   ├── user.ts
│   │   │   ├── product.ts
│   │   │   ├── order.ts
│   │   │   ├── payment.ts
│   │   │   ├── event.ts
│   │   │   └── common.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── utils/                     # Shared Utilities
│       ├── src/
│       │   ├── logger.ts          # Winston logging
│       │   ├── errors.ts          # Error classes
│       │   ├── config.ts          # Configuration helpers
│       │   └── correlation.ts     # Correlation ID handling
│       ├── package.json
│       └── tsconfig.json
│
├── scripts/                       # Setup & Utility Scripts
│   ├── setup.sh                   # Initial setup script
│   └── init-databases.sql         # Database initialization
│
├── docker-compose.yml             # Infrastructure services
├── package.json                   # Monorepo configuration
├── tsconfig.json                  # Base TypeScript config
├── .eslintrc.json                # ESLint configuration
├── .gitignore                    # Git ignore rules
├── .env.example                  # Environment variables template
├── Makefile                      # Common operations
├── README.md                     # Project documentation
└── ARCHITECTURE.md               # This file
```

## Microservices Overview

### 1. Auth Service (Port: 3001)
- User registration and authentication
- JWT token generation and validation
- Password reset functionality
- Session management with Redis

**Database**: `auth_service`
**Key Dependencies**: bcrypt, jsonwebtoken, ioredis

### 2. Product Service (Port: 3002)
- Product catalog management
- Inventory tracking and reservation
- Product variants and images
- Redis caching for performance

**Database**: `product_service`
**Key Dependencies**: pg, ioredis, kafkajs, AWS SDK

### 3. Order Service (Port: 3003)
- Order creation and management
- Saga orchestration for distributed transactions
- Order status tracking
- Inventory reservation coordination

**Database**: `order_service`
**Key Dependencies**: pg, kafkajs

### 4. Payment Service (Port: 3004)
- Payment processing via Stripe
- Refund management
- Webhook handling
- Idempotency guarantees

**Database**: `payment_service`
**Key Dependencies**: pg, kafkajs, stripe

### 5. Notification Service (Port: 3005)
- Email notifications (SendGrid)
- SMS notifications (Twilio)
- Push notifications (Firebase)
- Retry logic with exponential backoff

**Database**: `notification_service`
**Key Dependencies**: pg, kafkajs, @sendgrid/mail, twilio

### 6. Search Service (Port: 3006)
- Full-text search with Elasticsearch
- Faceted filtering
- Autocomplete suggestions
- Search result caching

**Database**: Elasticsearch
**Key Dependencies**: @elastic/elasticsearch, kafkajs, ioredis

### 7. Recommendation Service (Port: 3007)
- Collaborative filtering
- Content-based recommendations
- Trending products
- Personalized suggestions

**Database**: `recommendation_service`
**Key Dependencies**: pg, kafkajs, ioredis

### 8. Analytics Service (Port: 3008)
- Real-time metrics collection
- Sales analytics
- Customer insights
- TimescaleDB for time-series data

**Database**: `analytics_service`
**Key Dependencies**: pg, kafkajs

## Infrastructure Services

### PostgreSQL (Port: 5432)
- Separate database per microservice
- Database-per-service pattern
- Credentials: commercesphere/commercesphere_dev

### Redis (Port: 6379)
- Caching layer
- Session storage
- Rate limiting
- Pub/sub for real-time features

### Apache Kafka (Port: 9092)
- Event-driven communication
- Topics: orders, payments, inventory, analytics, notifications
- At-least-once delivery guarantee
- Dead letter queue for failed messages

### Elasticsearch (Port: 9200)
- Full-text search
- Product indexing
- Faceted search
- Autocomplete

## Communication Patterns

### Synchronous (REST)
- Client → API Gateway → Microservices
- Used for immediate responses
- Timeout: 30 seconds
- Circuit breaker protection

### Asynchronous (Events)
- Service → Kafka → Subscribed Services
- Used for eventual consistency
- Retry: 3 attempts with exponential backoff
- Dead letter queue for failures

## Data Flow Examples

### Order Creation Flow
1. Client → API Gateway → Order Service
2. Order Service creates order (status: CREATED)
3. Order Service publishes `order.created` event
4. Product Service reserves inventory
5. Payment Service processes payment
6. Payment Service publishes `payment.success` event
7. Order Service updates status to PAID
8. Notification Service sends confirmation

### Product Search Flow
1. Client → API Gateway → Search Service
2. Search Service queries Elasticsearch
3. If cache hit: return cached results
4. If cache miss: query ES, cache results, return
5. Product updates trigger index refresh via Kafka

## Shared Packages

### @commercesphere/types
Provides type-safe interfaces across all services:
- Domain models (User, Product, Order, Payment)
- Event schemas
- Common types (Address, Pagination)

### @commercesphere/utils
Provides shared utilities:
- **Logger**: Structured logging with Winston
- **Errors**: Custom error classes with HTTP status codes
- **Config**: Environment variable helpers
- **Correlation**: Request correlation ID handling

## Development Workflow

1. Start infrastructure: `make dev`
2. Build shared packages: `make build`
3. Start individual service: `cd services/<service> && npm run dev`
4. View logs: `make logs`
5. Stop infrastructure: `make dev-down`

## Testing Strategy

- **Unit Tests**: Test individual functions and classes
- **Integration Tests**: Test service interactions
- **Property-Based Tests**: Test correctness properties
- **E2E Tests**: Test complete user flows

## Deployment

- **Containerization**: Docker multi-stage builds
- **Orchestration**: Kubernetes with HPA
- **CI/CD**: GitHub Actions
- **Monitoring**: Prometheus + Grafana
- **Logging**: ELK Stack
- **Tracing**: Jaeger

## Security

- JWT authentication
- bcrypt password hashing (cost factor: 12)
- TLS for inter-service communication
- Input validation and sanitization
- Rate limiting
- Secrets management (Kubernetes Secrets/Vault)
