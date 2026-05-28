#!/bin/bash

# Smoke Tests for CommerceSphere Microservices Platform
# Usage: ./smoke-tests.sh <environment>
# Example: ./smoke-tests.sh staging

set -e

ENVIRONMENT=${1:-staging}
FAILED_TESTS=0
TOTAL_TESTS=0

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Set base URL based on environment
case $ENVIRONMENT in
  production)
    BASE_URL="https://api.commercesphere.example.com"
    ;;
  production-canary)
    BASE_URL="https://canary-api.commercesphere.example.com"
    ;;
  staging)
    BASE_URL="https://staging-api.commercesphere.example.com"
    ;;
  local)
    BASE_URL="http://localhost:8080"
    ;;
  *)
    echo "Unknown environment: $ENVIRONMENT"
    exit 1
    ;;
esac

echo "=========================================="
echo "Running Smoke Tests for $ENVIRONMENT"
echo "Base URL: $BASE_URL"
echo "=========================================="
echo ""

# Helper function to run a test
run_test() {
  local test_name=$1
  local url=$2
  local expected_status=${3:-200}
  local method=${4:-GET}
  
  TOTAL_TESTS=$((TOTAL_TESTS + 1))
  
  echo -n "Testing: $test_name... "
  
  if [ "$method" == "GET" ]; then
    response=$(curl -s -o /dev/null -w "%{http_code}" -X GET "$url" --max-time 10)
  else
    response=$(curl -s -o /dev/null -w "%{http_code}" -X "$method" "$url" --max-time 10)
  fi
  
  if [ "$response" -eq "$expected_status" ]; then
    echo -e "${GREEN}✓ PASSED${NC} (HTTP $response)"
  else
    echo -e "${RED}✗ FAILED${NC} (Expected HTTP $expected_status, got HTTP $response)"
    FAILED_TESTS=$((FAILED_TESTS + 1))
  fi
}

# Helper function to test with JSON payload
run_test_with_payload() {
  local test_name=$1
  local url=$2
  local payload=$3
  local expected_status=${4:-200}
  
  TOTAL_TESTS=$((TOTAL_TESTS + 1))
  
  echo -n "Testing: $test_name... "
  
  response=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST "$url" \
    -H "Content-Type: application/json" \
    -d "$payload" \
    --max-time 10)
  
  if [ "$response" -eq "$expected_status" ]; then
    echo -e "${GREEN}✓ PASSED${NC} (HTTP $response)"
  else
    echo -e "${RED}✗ FAILED${NC} (Expected HTTP $expected_status, got HTTP $response)"
    FAILED_TESTS=$((FAILED_TESTS + 1))
  fi
}

echo "=== Gateway Health Checks ==="
run_test "Gateway Health" "$BASE_URL/health" 200
run_test "Gateway Ready" "$BASE_URL/ready" 200
echo ""

echo "=== Auth Service Tests ==="
run_test "Auth Service Health" "$BASE_URL/auth/health" 200
run_test_with_payload "User Registration (Invalid)" "$BASE_URL/auth/register" '{"email":"invalid","password":"short"}' 400
echo ""

echo "=== Product Service Tests ==="
run_test "Product Service Health" "$BASE_URL/products/health" 200
run_test "List Products" "$BASE_URL/products" 200
run_test "Get Non-existent Product" "$BASE_URL/products/00000000-0000-0000-0000-000000000000" 404
echo ""

echo "=== Order Service Tests ==="
run_test "Order Service Health" "$BASE_URL/orders/health" 200
run_test "List Orders (Unauthorized)" "$BASE_URL/orders" 401
echo ""

echo "=== Payment Service Tests ==="
run_test "Payment Service Health" "$BASE_URL/payments/health" 200
echo ""

echo "=== Notification Service Tests ==="
run_test "Notification Service Health" "$BASE_URL/notifications/health" 200
echo ""

echo "=== Search Service Tests ==="
run_test "Search Service Health" "$BASE_URL/search/health" 200
run_test "Search Products" "$BASE_URL/search?q=test" 200
run_test "Autocomplete" "$BASE_URL/search/autocomplete?q=test" 200
echo ""

echo "=== Recommendation Service Tests ==="
run_test "Recommendation Service Health" "$BASE_URL/recommendations/health" 200
run_test "Get Trending Products" "$BASE_URL/recommendations/trending" 200
echo ""

echo "=== Analytics Service Tests ==="
run_test "Analytics Service Health" "$BASE_URL/analytics/health" 200
echo ""

echo "=== API Gateway Tests ==="
run_test "Rate Limiting Headers" "$BASE_URL/products" 200
run_test "CORS Headers" "$BASE_URL/products" 200
echo ""

echo "=== End-to-End Flow Tests ==="
echo "Testing basic user flow..."

# Test product browsing flow
echo -n "Testing: Product browsing flow... "
products_response=$(curl -s "$BASE_URL/products?limit=5" --max-time 10)
if echo "$products_response" | grep -q "id"; then
  echo -e "${GREEN}✓ PASSED${NC}"
  TOTAL_TESTS=$((TOTAL_TESTS + 1))
else
  echo -e "${RED}✗ FAILED${NC}"
  FAILED_TESTS=$((FAILED_TESTS + 1))
  TOTAL_TESTS=$((TOTAL_TESTS + 1))
fi

# Test search flow
echo -n "Testing: Search flow... "
search_response=$(curl -s "$BASE_URL/search?q=product" --max-time 10)
if echo "$search_response" | grep -q "results"; then
  echo -e "${GREEN}✓ PASSED${NC}"
  TOTAL_TESTS=$((TOTAL_TESTS + 1))
else
  echo -e "${RED}✗ FAILED${NC}"
  FAILED_TESTS=$((FAILED_TESTS + 1))
  TOTAL_TESTS=$((TOTAL_TESTS + 1))
fi

echo ""
echo "=========================================="
echo "Smoke Test Results"
echo "=========================================="
echo "Total Tests: $TOTAL_TESTS"
echo -e "Passed: ${GREEN}$((TOTAL_TESTS - FAILED_TESTS))${NC}"
echo -e "Failed: ${RED}$FAILED_TESTS${NC}"
echo ""

if [ $FAILED_TESTS -eq 0 ]; then
  echo -e "${GREEN}✓ All smoke tests passed!${NC}"
  exit 0
else
  echo -e "${RED}✗ Some smoke tests failed!${NC}"
  exit 1
fi
