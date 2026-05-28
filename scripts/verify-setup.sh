#!/bin/bash

set -e

echo "🔍 Verifying CommerceSphere Setup"
echo ""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check function
check() {
  if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓${NC} $1"
  else
    echo -e "${RED}✗${NC} $1"
    exit 1
  fi
}

# Check project structure
echo "📁 Checking project structure..."
[ -d "services" ] && check "services/ directory exists"
[ -d "shared" ] && check "shared/ directory exists"
[ -d "scripts" ] && check "scripts/ directory exists"
[ -f "package.json" ] && check "package.json exists"
[ -f "docker-compose.yml" ] && check "docker-compose.yml exists"
echo ""

# Check shared packages
echo "📦 Checking shared packages..."
[ -d "shared/types/dist" ] && check "shared/types built" || echo -e "${YELLOW}⚠${NC} shared/types not built (run: cd shared/types && npm run build)"
[ -d "shared/utils/dist" ] && check "shared/utils built" || echo -e "${YELLOW}⚠${NC} shared/utils not built (run: cd shared/utils && npm run build)"
echo ""

# Check services
echo "🔧 Checking services..."
for service in auth product order payment notification search recommendation analytics; do
  [ -d "services/$service/src" ] && check "services/$service exists"
done
echo ""

# Check Docker
echo "🐳 Checking Docker..."
command -v docker >/dev/null 2>&1 && check "Docker installed" || echo -e "${RED}✗${NC} Docker not installed"
command -v docker-compose >/dev/null 2>&1 && check "Docker Compose installed" || echo -e "${RED}✗${NC} Docker Compose not installed"
echo ""

# Check if Docker is running
if docker info >/dev/null 2>&1; then
  check "Docker daemon running"
  echo ""
  
  # Check infrastructure services
  echo "🏗️ Checking infrastructure services..."
  
  if docker-compose ps | grep -q "commercesphere-postgres"; then
    if docker-compose ps | grep "commercesphere-postgres" | grep -q "healthy\|running"; then
      check "PostgreSQL running"
    else
      echo -e "${YELLOW}⚠${NC} PostgreSQL not healthy"
    fi
  else
    echo -e "${YELLOW}⚠${NC} PostgreSQL not started (run: make dev)"
  fi
  
  if docker-compose ps | grep -q "commercesphere-redis"; then
    if docker-compose ps | grep "commercesphere-redis" | grep -q "healthy\|running"; then
      check "Redis running"
    else
      echo -e "${YELLOW}⚠${NC} Redis not healthy"
    fi
  else
    echo -e "${YELLOW}⚠${NC} Redis not started (run: make dev)"
  fi
  
  if docker-compose ps | grep -q "commercesphere-kafka"; then
    if docker-compose ps | grep "commercesphere-kafka" | grep -q "healthy\|running"; then
      check "Kafka running"
    else
      echo -e "${YELLOW}⚠${NC} Kafka not healthy"
    fi
  else
    echo -e "${YELLOW}⚠${NC} Kafka not started (run: make dev)"
  fi
  
  if docker-compose ps | grep -q "commercesphere-elasticsearch"; then
    if docker-compose ps | grep "commercesphere-elasticsearch" | grep -q "healthy\|running"; then
      check "Elasticsearch running"
    else
      echo -e "${YELLOW}⚠${NC} Elasticsearch not healthy"
    fi
  else
    echo -e "${YELLOW}⚠${NC} Elasticsearch not started (run: make dev)"
  fi
else
  echo -e "${YELLOW}⚠${NC} Docker daemon not running"
fi

echo ""
echo "✅ Verification complete!"
echo ""
echo "📝 Next steps:"
echo "  1. If shared packages not built: make build"
echo "  2. If infrastructure not running: make dev"
echo "  3. Start implementing services from tasks.md"
