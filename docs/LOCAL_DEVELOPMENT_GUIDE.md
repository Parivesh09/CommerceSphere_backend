# Local Development Guide

## Overview

This guide helps you set up CommerceSphere for local development. You'll be able to run all services locally with hot-reload for rapid iteration.

## Prerequisites

### Required Software

- **Node.js:** v20.0.0 or higher
- **npm:** v10.0.0 or higher (comes with Node.js)
- **Docker:** v24.0.0 or higher
- **Docker Compose:** v2.20.0 or higher
- **Git:** v2.40.0 or higher

### Optional Tools

- **Postman:** For API testing
- **VS Code:** Recommended IDE with extensions:
  - ESLint
  - Prettier
  - Docker
  - Kubernetes
  - REST Client
- **k9s:** Kubernetes CLI UI (if testing K8s locally)
- **pgAdmin:** PostgreSQL GUI client
- **Redis Commander:** Redis GUI client

### System Requirements

- **OS:** macOS, Linux, or Windows with WSL2
- **RAM:** Minimum 8GB (16GB recommended)
- **Disk Space:** 20GB free space
- **CPU:** 4 cores recommended

## Quick Start (5 Minutes)

### 1. Clone Repository

```bash
git clone https://github.com/commercesphere/platform.git
cd platform
```

### 2. Run Setup Script

```bash
make setup
```

This script will:
- Install all npm dependencies
- Build shared packages
- Create example .env files
- Start infrastructure services
- Initialize databases

### 3. Start a Service

```bash
cd services/auth
npm run dev
```

The service will start with hot-reload enabled on port 3001.

### 4. Test the API

```bash
curl http://localhost:3001/health
```

You should see: `{"status":"healthy"}`

## Detailed Setup

### Step 1: Install Dependencies

#### Install Root Dependencies

```bash
npm install
```

#### Install Shared Package Dependencies

```bash
cd shared/types
npm install
npm run build

cd ../utils
npm install
npm run build

cd ../..
```

#### Install Service Dependencies

```bash
# Install for all services
for service in services/*; do
  cd $service
  npm install
  cd ../..
done
```

Or install individually:

```bash
cd services/auth
npm install
```

### Step 2: Start Infrastructure Services

Start PostgreSQL, Redis, Kafka, and Elasticsearch:

```bash
docker-compose up -d
```

Verify services are running:

```bash
docker-compose ps
```

Expected output:
```
NAME                          STATUS    PORTS
commercesphere-postgres       Up        0.0.0.0:5432->5432/tcp
commercesphere-redis          Up        0.0.0.0:6379->6379/tcp
commercesphere-kafka          Up        0.0.0.0:9092->9092/tcp
commercesphere-elasticsearch  Up        0.0.0.0:9200->9200/tcp
```

### Step 3: Initialize Databases

Create databases for each service:

```bash
docker exec -it commercesphere-postgres psql -U commercesphere -f /docker-entrypoint-initdb.d/init-databases.sql
```

Or manually:

```bash
docker exec -it commercesphere-postgres psql -U commercesphere -c "
CREATE DATABASE auth_service;
CREATE DATABASE product_service;
CREATE DATABASE order_service;
CREATE DATABASE payment_service;
CREATE DATABASE notification_service;
CREATE DATABASE recommendation_service;
CREATE DATABASE analytics_service;
"
```

### Step 4: Configure Environment Variables

Each service needs a `.env` file. Copy from examples:

```bash
# For all services
for service in services/*; do
  cp $service/.env.example $service/.env
done
```

Or manually for each service:

```bash
cd services/auth
cp .env.example .env
```

Edit `.env` files as needed. Default values work for local development.

#### Example .env File (Auth Service)

```env
# Server
PORT=3001
NODE_ENV=development

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=auth_service
DB_USER=commercesphere
DB_PASSWORD=commercesphere_dev

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Kafka
KAFKA_BROKERS=localhost:9092
KAFKA_CLIENT_ID=auth-service

# JWT
JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_EXPIRES_IN=1h
REFRESH_TOKEN_EXPIRES_IN=7d

# Logging
LOG_LEVEL=debug
```

### Step 5: Run Database Migrations

If your services have migrations:

```bash
cd services/auth
npm run migrate
```

### Step 6: Start Services

#### Start Individual Service

```bash
cd services/auth
npm run dev
```

The service will start with hot-reload. Changes to source files will automatically restart the service.

#### Start Multiple Services

Use separate terminal windows/tabs:

```bash
# Terminal 1
cd services/auth && npm run dev

# Terminal 2
cd services/product && npm run dev

# Terminal 3
cd services/order && npm run dev
```

Or use a process manager like `concurrently`:

```bash
npm install -g concurrently

concurrently \
  "cd services/auth && npm run dev" \
  "cd services/product && npm run dev" \
  "cd services/order && npm run dev"
```

## Development Workflow

### Making Changes

1. **Edit Code:** Make changes to TypeScript files
2. **Auto-Reload:** Service automatically restarts
3. **Test:** Use Postman or curl to test changes
4. **Debug:** Check logs in terminal

### Running Tests

#### Unit Tests

```bash
# Run tests for a service
cd services/auth
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

#### Integration Tests

```bash
cd tests/integration
npm install
npm test
```

#### E2E Tests

```bash
cd tests/e2e
npm install
npm test
```

### Linting and Formatting

```bash
# Lint code
npm run lint

# Fix linting issues
npm run lint:fix

# Format code
npm run format
```

### Building

```bash
# Build a service
cd services/auth
npm run build

# Build all services
make build
```

## Working with Shared Packages

### Modifying Shared Types

```bash
cd shared/types
# Edit files in src/
npm run build
```

Services using the shared package will need to be restarted to pick up changes.

### Linking for Development

For faster iteration, use npm link:

```bash
# In shared package
cd shared/types
npm link

# In service
cd services/auth
npm link @commercesphere/types
```

## Database Management

### Accessing PostgreSQL

```bash
# Using psql
docker exec -it commercesphere-postgres psql -U commercesphere -d auth_service

# Using pgAdmin
# Connect to localhost:5432
# Username: commercesphere
# Password: commercesphere_dev
```

### Common PostgreSQL Commands

```sql
-- List databases
\l

-- Connect to database
\c auth_service

-- List tables
\dt

-- Describe table
\d users

-- Query data
SELECT * FROM users;

-- Exit
\q
```

### Reset Database

```bash
# Drop and recreate database
docker exec -it commercesphere-postgres psql -U commercesphere -c "
DROP DATABASE IF EXISTS auth_service;
CREATE DATABASE auth_service;
"

# Run migrations again
cd services/auth
npm run migrate
```

## Working with Redis

### Accessing Redis

```bash
# Using redis-cli
docker exec -it commercesphere-redis redis-cli

# Using Redis Commander (GUI)
docker run -d --name redis-commander \
  --link commercesphere-redis:redis \
  -p 8081:8081 \
  rediscommander/redis-commander
# Open http://localhost:8081
```

### Common Redis Commands

```bash
# List all keys
KEYS *

# Get value
GET key_name

# Set value
SET key_name value

# Delete key
DEL key_name

# Clear all data
FLUSHALL

# Exit
exit
```

## Working with Kafka

### Accessing Kafka

```bash
# Enter Kafka container
docker exec -it commercesphere-kafka bash
```

### Common Kafka Commands

```bash
# List topics
kafka-topics --list --bootstrap-server localhost:9092

# Create topic
kafka-topics --create \
  --topic test-topic \
  --bootstrap-server localhost:9092 \
  --partitions 3 \
  --replication-factor 1

# Describe topic
kafka-topics --describe \
  --topic orders \
  --bootstrap-server localhost:9092

# Produce messages
kafka-console-producer \
  --topic orders \
  --bootstrap-server localhost:9092

# Consume messages
kafka-console-consumer \
  --topic orders \
  --from-beginning \
  --bootstrap-server localhost:9092

# Delete topic
kafka-topics --delete \
  --topic test-topic \
  --bootstrap-server localhost:9092
```

### Initialize Kafka Topics

```bash
npm run init:kafka
```

Or manually:

```bash
node scripts/init-kafka-topics.ts
```

## Working with Elasticsearch

### Accessing Elasticsearch

```bash
# Check cluster health
curl http://localhost:9200/_cluster/health

# List indices
curl http://localhost:9200/_cat/indices?v

# Using Kibana (if installed)
# Open http://localhost:5601
```

### Common Elasticsearch Operations

```bash
# Create index
curl -X PUT http://localhost:9200/products

# Index document
curl -X POST http://localhost:9200/products/_doc \
  -H 'Content-Type: application/json' \
  -d '{"title":"Test Product","price":99.99}'

# Search
curl -X GET http://localhost:9200/products/_search?q=test

# Delete index
curl -X DELETE http://localhost:9200/products
```

## Debugging

### VS Code Debug Configuration

Create `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug Auth Service",
      "runtimeArgs": ["-r", "ts-node/register"],
      "args": ["${workspaceFolder}/services/auth/src/index.ts"],
      "env": {
        "NODE_ENV": "development"
      },
      "envFile": "${workspaceFolder}/services/auth/.env",
      "sourceMaps": true,
      "cwd": "${workspaceFolder}/services/auth",
      "protocol": "inspector"
    }
  ]
}
```

### Debugging with Chrome DevTools

```bash
cd services/auth
node --inspect-brk -r ts-node/register src/index.ts
```

Open `chrome://inspect` in Chrome and click "inspect".

### Logging

Services use structured logging. Adjust log level in `.env`:

```env
LOG_LEVEL=debug  # debug, info, warn, error
```

View logs:

```bash
# Service logs (in terminal where service is running)

# Infrastructure logs
docker-compose logs -f postgres
docker-compose logs -f kafka
docker-compose logs -f redis
docker-compose logs -f elasticsearch
```

## Testing APIs

### Using cURL

```bash
# Register user
curl -X POST http://localhost:3001/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "Test123!",
    "name": "Test User"
  }'

# Login
curl -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "Test123!"
  }'

# Get products (with auth)
curl -X GET http://localhost:3002/products \
  -H "Authorization: Bearer <access_token>"
```

### Using Postman

1. Import collection from `docs/postman/CommerceSphere.postman_collection.json`
2. Import environment from `docs/postman/Local.postman_environment.json`
3. Run requests

### Using REST Client (VS Code Extension)

Create `test.http`:

```http
### Register User
POST http://localhost:3001/auth/register
Content-Type: application/json

{
  "email": "test@example.com",
  "password": "Test123!",
  "name": "Test User"
}

### Login
POST http://localhost:3001/auth/login
Content-Type: application/json

{
  "email": "test@example.com",
  "password": "Test123!"
}

### Get Products
GET http://localhost:3002/products
Authorization: Bearer {{accessToken}}
```

## Common Issues and Solutions

### Port Already in Use

```bash
# Find process using port
lsof -i :3001

# Kill process
kill -9 <PID>

# Or change port in .env
PORT=3011
```

### Cannot Connect to Database

```bash
# Check if PostgreSQL is running
docker-compose ps postgres

# Check logs
docker-compose logs postgres

# Restart PostgreSQL
docker-compose restart postgres

# Verify connection
docker exec -it commercesphere-postgres psql -U commercesphere -c "SELECT 1"
```

### Kafka Not Starting

```bash
# Kafka takes 30-60 seconds to start
# Check logs
docker-compose logs kafka

# Restart Kafka
docker-compose restart kafka

# Wait for Kafka to be ready
sleep 30
```

### Module Not Found Errors

```bash
# Rebuild shared packages
cd shared/types && npm run build
cd ../utils && npm run build

# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

### TypeScript Compilation Errors

```bash
# Clean build artifacts
npm run clean

# Rebuild
npm run build

# Check TypeScript version
npx tsc --version
```

### Hot Reload Not Working

```bash
# Restart service
# Press Ctrl+C and run npm run dev again

# Or use nodemon directly
npx nodemon --watch src --exec ts-node src/index.ts
```

## Performance Tips

### Reduce Docker Resource Usage

Edit `docker-compose.yml` to limit resources:

```yaml
services:
  postgres:
    deploy:
      resources:
        limits:
          cpus: '1'
          memory: 1G
```

### Use Docker BuildKit

```bash
export DOCKER_BUILDKIT=1
docker-compose build
```

### Optimize Node.js Memory

```bash
# Increase Node.js memory limit
export NODE_OPTIONS="--max-old-space-size=4096"
npm run dev
```

## Git Workflow

### Branch Naming

- `feature/` - New features
- `bugfix/` - Bug fixes
- `hotfix/` - Production hotfixes
- `refactor/` - Code refactoring

### Commit Messages

Follow conventional commits:

```
feat: add user registration endpoint
fix: resolve database connection timeout
docs: update API documentation
test: add unit tests for auth service
refactor: extract validation logic
```

### Pre-commit Hooks

Install Husky for pre-commit hooks:

```bash
npm install --save-dev husky
npx husky install

# Add pre-commit hook
npx husky add .husky/pre-commit "npm run lint && npm test"
```

## IDE Configuration

### VS Code Settings

Create `.vscode/settings.json`:

```json
{
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "typescript.tsdk": "node_modules/typescript/lib",
  "files.exclude": {
    "**/node_modules": true,
    "**/dist": true
  }
}
```

### Recommended Extensions

- ESLint
- Prettier
- Docker
- REST Client
- GitLens
- Error Lens
- Import Cost

## Useful Commands

```bash
# Start infrastructure
make dev

# Stop infrastructure
make dev-down

# Clean everything (removes volumes)
make dev-clean

# View logs
make logs

# Build all services
make build

# Run all tests
make test

# Lint all code
make lint

# Show help
make help
```

## Next Steps

1. **Read the Architecture:** Check `ARCHITECTURE.md`
2. **Review API Docs:** See `docs/API_DOCUMENTATION.md`
3. **Implement Features:** Follow tasks in `.kiro/specs/ecommerce-microservices-platform/tasks.md`
4. **Write Tests:** Add unit and integration tests
5. **Deploy:** Follow `docs/DEPLOYMENT_GUIDE.md`

## Getting Help

- **Documentation:** Check `README.md` and other docs
- **Issues:** https://github.com/commercesphere/platform/issues
- **Discussions:** https://github.com/commercesphere/platform/discussions
- **Slack:** #commercesphere-dev

## Contributing

See `CONTRIBUTING.md` for contribution guidelines.

## Cleanup

To completely remove all development artifacts:

```bash
# Stop and remove containers
make dev-clean

# Remove node_modules
find . -name "node_modules" -type d -exec rm -rf {} +

# Remove build artifacts
find . -name "dist" -type d -exec rm -rf {} +

# Remove Docker volumes
docker volume prune -f

# Remove Docker images
docker image prune -a -f
```

**Warning:** This will delete all local data!
