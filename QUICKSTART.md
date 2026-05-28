# Quick Start Guide

Get CommerceSphere up and running in 5 minutes.

## Prerequisites

- Node.js 20+ installed
- Docker and Docker Compose installed
- 8GB RAM available for Docker

## Step 1: Clone and Setup

```bash
# Run the automated setup script
make setup

# Or manually:
npm install
cd shared/types && npm install && npm run build
cd ../utils && npm install && npm run build
cd ../..
```

## Step 2: Start Infrastructure

```bash
# Start PostgreSQL, Redis, Kafka, and Elasticsearch
make dev

# Verify services are running
make ps
```

You should see all services as "healthy" or "running".

## Step 3: Configure Environment

```bash
# Copy the example environment file
cp .env.example services/auth/.env

# Edit the .env file with your configuration
# For local development, the defaults should work
```

## Step 4: Start a Service

```bash
# Start the Auth Service
cd services/auth
npm install
npm run dev
```

The service should start on port 3001 (or as configured in .env).

## Verify Installation

### Check Infrastructure Services

```bash
# PostgreSQL
docker exec -it commercesphere-postgres psql -U commercesphere -c "\l"

# Redis
docker exec -it commercesphere-redis redis-cli ping

# Kafka
docker exec -it commercesphere-kafka kafka-topics --list --bootstrap-server localhost:9092

# Elasticsearch
curl http://localhost:9200/_cluster/health
```

### Check Service Logs

```bash
# View all infrastructure logs
make logs

# View specific service logs
docker-compose logs -f postgres
docker-compose logs -f kafka
```

## Common Commands

```bash
# Start infrastructure
make dev

# Stop infrastructure
make dev-down

# Stop and remove all data
make dev-clean

# Build all packages
make build

# Run tests
make test

# Lint code
make lint

# Show help
make help
```

## Troubleshooting

### Port Already in Use

If you see "port already in use" errors:

```bash
# Check what's using the port
lsof -i :5432  # PostgreSQL
lsof -i :6379  # Redis
lsof -i :9092  # Kafka
lsof -i :9200  # Elasticsearch

# Stop the conflicting service or change the port in docker-compose.yml
```

### Services Not Healthy

If services show as "unhealthy":

```bash
# Check logs for errors
docker-compose logs <service-name>

# Restart the service
docker-compose restart <service-name>

# Full restart
make dev-clean
make dev
```

### Cannot Connect to Database

```bash
# Verify PostgreSQL is running
docker-compose ps postgres

# Check if databases were created
docker exec -it commercesphere-postgres psql -U commercesphere -c "\l"

# Manually create a database if needed
docker exec -it commercesphere-postgres psql -U commercesphere -c "CREATE DATABASE auth_service;"
```

### Kafka Connection Issues

```bash
# Verify Kafka is running
docker-compose ps kafka

# Check Kafka logs
docker-compose logs kafka

# Wait for Kafka to fully start (can take 30-60 seconds)
sleep 30
```

## Next Steps

1. **Implement Services**: Follow the tasks in `.kiro/specs/ecommerce-microservices-platform/tasks.md`
2. **Read Documentation**: Check `README.md` and `ARCHITECTURE.md`
3. **Configure API Gateway**: Set up Nginx or Kong for routing
4. **Add Tests**: Write unit and integration tests
5. **Deploy**: Set up Kubernetes manifests for production

## Getting Help

- Check the [README.md](README.md) for detailed documentation
- Review [ARCHITECTURE.md](ARCHITECTURE.md) for system design
- See task list in `.kiro/specs/ecommerce-microservices-platform/tasks.md`

## Clean Up

To completely remove all services and data:

```bash
make dev-clean
docker system prune -a --volumes
```

**Warning**: This will delete all Docker containers, images, and volumes!
