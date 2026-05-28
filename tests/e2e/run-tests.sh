#!/bin/bash

# E2E Test Runner Script for CommerceSphere Platform
# This script runs end-to-end tests with proper setup and cleanup

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
TEST_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$TEST_DIR/../.." && pwd)"
SPECIFIC_TEST=""
VERBOSE=false

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --test)
      SPECIFIC_TEST="$2"
      shift 2
      ;;
    --verbose)
      VERBOSE=true
      shift
      ;;
    --help)
      echo "Usage: ./run-tests.sh [OPTIONS]"
      echo ""
      echo "Options:"
      echo "  --test <filename>    Run specific test file"
      echo "  --verbose           Enable verbose output"
      echo "  --help              Show this help message"
      echo ""
      echo "Examples:"
      echo "  ./run-tests.sh"
      echo "  ./run-tests.sh --test user-registration-login.e2e.test.ts"
      echo "  ./run-tests.sh --verbose"
      exit 0
      ;;
    *)
      echo -e "${RED}Unknown option: $1${NC}"
      echo "Use --help for usage information"
      exit 1
      ;;
  esac
done

# Print header
echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║         CommerceSphere E2E Test Runner                    ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check prerequisites
echo -e "${YELLOW}Checking prerequisites...${NC}"

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
  echo -e "${RED}✗ Docker is not running${NC}"
  echo "Please start Docker and try again"
  exit 1
fi
echo -e "${GREEN}✓ Docker is running${NC}"

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
  echo -e "${RED}✗ Node.js is not installed${NC}"
  echo "Please install Node.js 20+ and try again"
  exit 1
fi
echo -e "${GREEN}✓ Node.js is installed ($(node --version))${NC}"

# Check available memory
if [[ "$OSTYPE" == "darwin"* ]]; then
  # macOS
  TOTAL_MEM=$(sysctl -n hw.memsize)
  TOTAL_MEM_GB=$((TOTAL_MEM / 1024 / 1024 / 1024))
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
  # Linux
  TOTAL_MEM=$(grep MemTotal /proc/meminfo | awk '{print $2}')
  TOTAL_MEM_GB=$((TOTAL_MEM / 1024 / 1024))
else
  TOTAL_MEM_GB=0
fi

if [ $TOTAL_MEM_GB -lt 8 ]; then
  echo -e "${YELLOW}⚠ Warning: Less than 8GB RAM available${NC}"
  echo "E2E tests may be slow or fail due to insufficient memory"
fi

echo ""

# Install dependencies if needed
if [ ! -d "$TEST_DIR/node_modules" ]; then
  echo -e "${YELLOW}Installing dependencies...${NC}"
  cd "$TEST_DIR"
  npm install
  echo -e "${GREEN}✓ Dependencies installed${NC}"
  echo ""
fi

# Build service images if needed
echo -e "${YELLOW}Checking service Docker images...${NC}"

SERVICES=("auth-service" "product-service" "order-service" "payment-service" "notification-service" "search-service" "analytics-service" "gateway")
MISSING_IMAGES=()

for service in "${SERVICES[@]}"; do
  if ! docker images | grep -q "commercesphere/$service"; then
    MISSING_IMAGES+=("$service")
  fi
done

if [ ${#MISSING_IMAGES[@]} -gt 0 ]; then
  echo -e "${YELLOW}⚠ Missing Docker images: ${MISSING_IMAGES[*]}${NC}"
  echo "Building missing images..."
  
  cd "$PROJECT_ROOT"
  for service in "${MISSING_IMAGES[@]}"; do
    echo -e "${YELLOW}Building $service...${NC}"
    docker build -t "commercesphere/$service:test" "./services/${service//-service/}" || {
      echo -e "${RED}✗ Failed to build $service${NC}"
      exit 1
    }
  done
  
  echo -e "${GREEN}✓ All images built${NC}"
else
  echo -e "${GREEN}✓ All service images available${NC}"
fi

echo ""

# Clean up any existing test containers
echo -e "${YELLOW}Cleaning up existing test containers...${NC}"
docker ps -a | grep -E "commercesphere|postgres|redis|kafka|elasticsearch" | awk '{print $1}' | xargs -r docker rm -f > /dev/null 2>&1 || true
echo -e "${GREEN}✓ Cleanup complete${NC}"
echo ""

# Run tests
cd "$TEST_DIR"

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                    Running E2E Tests                      ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

if [ -n "$SPECIFIC_TEST" ]; then
  echo -e "${YELLOW}Running specific test: $SPECIFIC_TEST${NC}"
  echo ""
  
  if [ "$VERBOSE" = true ]; then
    npm test -- "src/tests/$SPECIFIC_TEST" --verbose
  else
    npm test -- "src/tests/$SPECIFIC_TEST"
  fi
else
  echo -e "${YELLOW}Running all E2E tests...${NC}"
  echo ""
  
  if [ "$VERBOSE" = true ]; then
    npm test -- --verbose
  else
    npm test
  fi
fi

TEST_EXIT_CODE=$?

echo ""

# Final cleanup
echo -e "${YELLOW}Cleaning up test containers...${NC}"
docker ps -a | grep -E "commercesphere|postgres|redis|kafka|elasticsearch" | awk '{print $1}' | xargs -r docker rm -f > /dev/null 2>&1 || true
echo -e "${GREEN}✓ Cleanup complete${NC}"
echo ""

# Print results
if [ $TEST_EXIT_CODE -eq 0 ]; then
  echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
  echo -e "${GREEN}║                  ✓ All Tests Passed!                      ║${NC}"
  echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
  exit 0
else
  echo -e "${RED}╔════════════════════════════════════════════════════════════╗${NC}"
  echo -e "${RED}║                  ✗ Tests Failed                           ║${NC}"
  echo -e "${RED}╚════════════════════════════════════════════════════════════╝${NC}"
  exit 1
fi
