#!/bin/bash

set -e

echo "🚀 Setting up CommerceSphere Development Environment"
echo ""

# Check prerequisites
echo "📋 Checking prerequisites..."
command -v node >/dev/null 2>&1 || { echo "❌ Node.js is required but not installed. Aborting." >&2; exit 1; }
command -v docker >/dev/null 2>&1 || { echo "❌ Docker is required but not installed. Aborting." >&2; exit 1; }
command -v docker-compose >/dev/null 2>&1 || { echo "❌ Docker Compose is required but not installed. Aborting." >&2; exit 1; }

echo "✅ Prerequisites check passed"
echo ""

# Install dependencies
echo "📦 Installing dependencies..."
npm install
echo "✅ Dependencies installed"
echo ""

# Build shared packages
echo "🔨 Building shared packages..."
cd shared/types && npm install && npm run build
cd ../utils && npm install && npm run build
cd ../..
echo "✅ Shared packages built"
echo ""

# Start infrastructure
echo "🐳 Starting infrastructure services..."
docker-compose up -d
echo "✅ Infrastructure services started"
echo ""

# Wait for services to be healthy
echo "⏳ Waiting for services to be healthy..."
sleep 10

# Check service health
echo "🏥 Checking service health..."
docker-compose ps

echo ""
echo "✅ Setup complete!"
echo ""
echo "📝 Next steps:"
echo "  1. Create .env files for each service (see .env.example)"
echo "  2. Start individual services with: cd services/<service> && npm run dev"
echo "  3. Access infrastructure:"
echo "     - PostgreSQL: localhost:5432"
echo "     - Redis: localhost:6379"
echo "     - Kafka: localhost:9092"
echo "     - Elasticsearch: localhost:9200"
echo ""
