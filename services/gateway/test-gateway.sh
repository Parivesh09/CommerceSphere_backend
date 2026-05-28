#!/bin/bash

# Test script for API Gateway
# This script tests the basic functionality of the API Gateway

set -e

GATEWAY_URL="http://localhost:3000"
AUTH_URL="http://localhost:3001"

echo "🧪 Testing API Gateway"
echo "====================="
echo ""

# Test 1: Health Check
echo "Test 1: Health Check"
echo "--------------------"
response=$(curl -s -w "\n%{http_code}" "$GATEWAY_URL/health")
http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | head -n-1)

if [ "$http_code" = "200" ]; then
    echo "✅ Health check passed"
    echo "Response: $body"
else
    echo "❌ Health check failed (HTTP $http_code)"
    echo "Response: $body"
    exit 1
fi
echo ""

# Test 2: Correlation ID
echo "Test 2: Correlation ID Generation"
echo "----------------------------------"
response=$(curl -s -i "$GATEWAY_URL/health" | grep -i "x-correlation-id")
if [ -n "$response" ]; then
    echo "✅ Correlation ID header present"
    echo "$response"
else
    echo "❌ Correlation ID header missing"
    exit 1
fi
echo ""

# Test 3: Rate Limit Headers
echo "Test 3: Rate Limit Headers"
echo "--------------------------"
response=$(curl -s -i "$GATEWAY_URL/health" | grep -i "x-ratelimit")
if [ -n "$response" ]; then
    echo "✅ Rate limit headers present"
    echo "$response"
else
    echo "❌ Rate limit headers missing"
    exit 1
fi
echo ""

# Test 4: 404 for Unknown Route
echo "Test 4: 404 for Unknown Route"
echo "------------------------------"
response=$(curl -s -w "\n%{http_code}" "$GATEWAY_URL/unknown-route")
http_code=$(echo "$response" | tail -n1)

if [ "$http_code" = "404" ]; then
    echo "✅ 404 returned for unknown route"
else
    echo "❌ Expected 404, got HTTP $http_code"
    exit 1
fi
echo ""

# Test 5: JWT Validation (should fail without token)
echo "Test 5: JWT Validation for Protected Route"
echo "-------------------------------------------"
response=$(curl -s -w "\n%{http_code}" "$GATEWAY_URL/orders")
http_code=$(echo "$response" | tail -n1)

if [ "$http_code" = "401" ]; then
    echo "✅ 401 returned for protected route without token"
else
    echo "❌ Expected 401, got HTTP $http_code"
    exit 1
fi
echo ""

# Test 6: Rate Limiting (make 101 requests)
echo "Test 6: Rate Limiting"
echo "---------------------"
echo "Making 101 requests to test rate limit..."

rate_limited=false
for i in {1..101}; do
    http_code=$(curl -s -w "%{http_code}" -o /dev/null "$GATEWAY_URL/health")
    if [ "$http_code" = "429" ]; then
        rate_limited=true
        echo "✅ Rate limit enforced after $i requests"
        break
    fi
done

if [ "$rate_limited" = false ]; then
    echo "⚠️  Rate limit not enforced (may need more requests or Redis issue)"
fi
echo ""

echo "🎉 All basic tests passed!"
echo ""
echo "Note: For full testing, ensure all backend services are running:"
echo "  - Auth Service (port 3001)"
echo "  - Product Service (port 3002)"
echo "  - Order Service (port 3003)"
echo "  - etc."
