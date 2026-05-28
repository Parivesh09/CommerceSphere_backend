# CommerceSphere - E-commerce Microservices Platform

A production-grade, scalable microservices-based e-commerce platform demonstrating distributed systems architecture, event-driven communication, and modern DevOps practices.

## Architecture Overview

CommerceSphere consists of 9 core microservices:

- **API Gateway** - Request routing, authentication, and rate limiting
- **Auth Service** - User authentication and authorization
- **Product Service** - Product catalog and inventory management
- **Order Service** - Order processing and saga orchestration
- **Payment Service** - Payment processing and refunds
- **Notification Service** - Multi-channel notifications (email, SMS, push)
- **Search Service** - Full-text search with Elasticsearch
- **Recommendation Service** - Personalized product recommendations
- **Analytics Service** - Business metrics and reporting

## Technology Stack

- **Runtime**: Node.js with TypeScript
- **Databases**: PostgreSQL (per service)
- **Cache**: Redis
- **Message Broker**: Apache Kafka
- **Search**: Elasticsearch
- **Containerization**: Docker & Docker Compose
- **Orchestration**: Kubernetes (production)

## Project Structure

```
commercesphere/
├── services/              # Microservices
│   ├── auth/
│   ├── product/
│   ├── order/
│   ├── payment/
│   ├── notification/
│   ├── search/
│   ├── recommendation/
│   └── analytics/
├── shared/                # Shared packages
│   ├── types/            # TypeScript type definitions
│   └── utils/            # Shared utilities (logging, errors, config)
├── scripts/              # Setup and utility scripts
├── docker-compose.yml    # Local development infrastructure
└── package.json          # Monorepo configuration
```

## Prerequisites

- Node.js 20+
- Docker & Docker Compose
- npm or yarn

## Getting Started

### 1. Install Dependencies

```bash
npm install
```

### 2. Start Infrastructure Services

Start PostgreSQL, Redis, Kafka, and Elasticsearch:

```bash
npm run dev
```

This will start all infrastructure services in Docker containers:
- PostgreSQL: `localhost:5432`
- Redis: `localhost:6379`
- Kafka: `localhost:9092`
- Elasticsearch: `localhost:9200`

### 3. Build Shared Packages

```bash
cd shared/types && npm run build
cd ../utils && npm run build
```

### 4. Environment Configuration

Each service requires environment variables. Create `.env` files in each service directory based on the following template:

```env
# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=<service>_service
DB_USER=commercesphere
DB_PASSWORD=commercesphere_dev

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Kafka
KAFKA_BROKERS=localhost:9092
KAFKA_CLIENT_ID=<service>-service

# Service-specific variables
PORT=3000
NODE_ENV=development
```

### 5. Run Individual Services

```bash
cd services/auth
npm run dev
```

## Development Commands

- `npm run dev` - Start all infrastructure services
- `npm run dev:down` - Stop all infrastructure services
- `npm run dev:clean` - Stop and remove all volumes
- `npm run build` - Build all services and shared packages
- `npm run test` - Run tests across all services
- `npm run lint` - Lint all TypeScript code

## Infrastructure Services

### PostgreSQL

Separate databases are created for each microservice:
- `auth_service`
- `product_service`
- `order_service`
- `payment_service`
- `notification_service`
- `recommendation_service`
- `analytics_service`

### Kafka Topics

The following topics are used for event-driven communication:
- `orders` - Order lifecycle events
- `payments` - Payment events
- `inventory` - Inventory updates
- `analytics` - Analytics events
- `notifications` - Notification triggers

### Health Checks

All infrastructure services include health checks:
- PostgreSQL: `pg_isready`
- Redis: `redis-cli ping`
- Kafka: `kafka-broker-api-versions`
- Elasticsearch: `/_cluster/health`

## Shared Packages

### @commercesphere/types

Shared TypeScript type definitions for:
- User, Product, Order, Payment models
- Event schemas
- Common interfaces

### @commercesphere/utils

Shared utilities for:
- Structured logging (Winston)
- Error handling
- Configuration management
- Correlation ID generation

## Next Steps

1. ✅ Implement Auth Service (Task 2)
2. ✅ Set up API Gateway (Task 3)
3. ✅ Implement remaining microservices
4. ✅ Configure Kubernetes manifests
5. ✅ Set up CI/CD pipeline

## CI/CD Pipeline

The project includes a comprehensive CI/CD pipeline using GitHub Actions:

- **Continuous Integration:** Automated testing, linting, and Docker image building
- **Continuous Deployment:** Automated deployment to staging and production
- **Multiple Deployment Strategies:** Canary, rolling, and blue-green deployments
- **Automated Rollback:** Automatic rollback on deployment failures
- **Smoke Tests:** Post-deployment verification

### Quick Commands

```bash
# Run CI locally
make ci-local

# Deploy to staging
make deploy-staging

# Run smoke tests
make smoke-test-staging

# Check deployment status
make status-production
```

For detailed CI/CD documentation, see:
- [CI/CD Guide](docs/CI_CD_GUIDE.md)
- [Quick Reference](CICD_QUICK_REFERENCE.md)
- [Workflows Documentation](.github/workflows/README.md)

## Documentation

- [Architecture](ARCHITECTURE.md) - System architecture and design decisions
- [CI/CD Guide](docs/CI_CD_GUIDE.md) - Complete CI/CD pipeline documentation
- [Quick Reference](CICD_QUICK_REFERENCE.md) - Quick reference for common operations
- [Security Guide](docs/SECURITY_GUIDE.md) - Security implementation details
- [Kafka Setup](docs/KAFKA_SETUP.md) - Kafka configuration and usage
- [Kubernetes Deployment](kubernetes/README.md) - Kubernetes deployment guide

## License

MIT
