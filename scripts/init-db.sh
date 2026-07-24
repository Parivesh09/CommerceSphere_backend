#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_CMD=(docker compose)

if ! docker compose version >/dev/null 2>&1; then
  if command -v docker-compose >/dev/null 2>&1; then
    COMPOSE_CMD=(docker-compose)
  else
    echo "❌ Docker Compose is required but was not found."
    exit 1
  fi
fi

if ! docker ps >/dev/null 2>&1; then
  echo "❌ Docker daemon is not running. Start Docker and try again."
  exit 1
fi

echo "🗄️ Starting PostgreSQL container..."
"${COMPOSE_CMD[@]}" -f "$ROOT_DIR/docker-compose.yml" up -d postgres >/dev/null

echo "⏳ Waiting for PostgreSQL to become ready..."
for _ in {1..30}; do
  if "${COMPOSE_CMD[@]}" -f "$ROOT_DIR/docker-compose.yml" exec -T postgres pg_isready -U commercesphere >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

echo "🛠️ Creating databases if they do not already exist..."
cat <<'SQL' | "${COMPOSE_CMD[@]}" -f "$ROOT_DIR/docker-compose.yml" exec -T postgres psql -U commercesphere -d postgres
SELECT 'CREATE DATABASE auth_service' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'auth_service')\gexec
SELECT 'CREATE DATABASE product_service' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'product_service')\gexec
SELECT 'CREATE DATABASE order_service' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'order_service')\gexec
SELECT 'CREATE DATABASE payment_service' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'payment_service')\gexec
SELECT 'CREATE DATABASE notification_service' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'notification_service')\gexec
SELECT 'CREATE DATABASE recommendation_service' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'recommendation_service')\gexec
SELECT 'CREATE DATABASE analytics_service' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'analytics_service')\gexec
GRANT ALL PRIVILEGES ON DATABASE auth_service TO commercesphere;
GRANT ALL PRIVILEGES ON DATABASE product_service TO commercesphere;
GRANT ALL PRIVILEGES ON DATABASE order_service TO commercesphere;
GRANT ALL PRIVILEGES ON DATABASE payment_service TO commercesphere;
GRANT ALL PRIVILEGES ON DATABASE notification_service TO commercesphere;
GRANT ALL PRIVILEGES ON DATABASE recommendation_service TO commercesphere;
GRANT ALL PRIVILEGES ON DATABASE analytics_service TO commercesphere;
SQL

echo "✅ Database initialization complete"
