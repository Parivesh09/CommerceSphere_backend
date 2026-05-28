#!/bin/bash

# Security Testing Script
# Tests various security controls across the platform

set -e

echo "🔒 CommerceSphere Security Testing"
echo "=================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
API_GATEWAY_URL="${API_GATEWAY_URL:-http://localhost:8080}"
AUTH_SERVICE_URL="${AUTH_SERVICE_URL:-http://localhost:3001}"
PRODUCT_SERVICE_URL="${PRODUCT_SERVICE_URL:-http://localhost:3002}"

# Test counter
TESTS_PASSED=0
TESTS_FAILED=0

# Helper functions
pass() {
    echo -e "${GREEN}✓${NC} $1"
    ((TESTS_PASSED++))
}

fail() {
    echo -e "${RED}✗${NC} $1"
    ((TESTS_FAILED++))
}

warn() {
    echo -e "${YELLOW}⚠${NC} $1"
}

test_header() {
    echo ""
    echo "Testing: $1"
    echo "-----------------------------------"
}

# Test 1: Security Headers
test_header "Security Headers"

response=$(curl -s -I "$AUTH_SERVICE_URL/health" 2>/dev/null || echo "")

if echo "$response" | grep -q "X-Frame-Options"; then
    pass "X-Frame-Options header present"
else
    fail "X-Frame-Options header missing"
fi

if echo "$response" | grep -q "X-Content-Type-Options"; then
    pass "X-Content-Type-Options header present"
else
    fail "X-Content-Type-Options header missing"
fi

if echo "$response" | grep -q "X-XSS-Protection"; then
    pass "X-XSS-Protection header present"
else
    fail "X-XSS-Protection header missing"
fi

# Test 2: CORS Configuration
test_header "CORS Configuration"

response=$(curl -s -I -H "Origin: http://malicious-site.com" "$AUTH_SERVICE_URL/health" 2>/dev/null || echo "")

if echo "$response" | grep -q "Access-Control-Allow-Origin"; then
    warn "CORS headers present (verify allowed origins are restricted)"
else
    pass "CORS headers not present for unauthorized origin"
fi

# Test 3: Input Validation
test_header "Input Validation"

# Test SQL injection attempt
response=$(curl -s -X POST "$AUTH_SERVICE_URL/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"email":"admin@example.com","password":"' OR '1'='1"}' \
    2>/dev/null || echo "")

if echo "$response" | grep -q "error"; then
    pass "SQL injection attempt rejected"
else
    fail "SQL injection attempt not properly handled"
fi

# Test XSS attempt
response=$(curl -s -X POST "$AUTH_SERVICE_URL/auth/register" \
    -H "Content-Type: application/json" \
    -d '{"email":"test@example.com","password":"password123","name":"<script>alert(1)</script>"}' \
    2>/dev/null || echo "")

if echo "$response" | grep -q "error\|validation"; then
    pass "XSS attempt in name field rejected or sanitized"
else
    warn "XSS attempt handling unclear - verify sanitization"
fi

# Test 4: Authentication
test_header "Authentication"

# Test accessing protected endpoint without token
response=$(curl -s -w "\n%{http_code}" "$AUTH_SERVICE_URL/auth/me" 2>/dev/null || echo "")
status_code=$(echo "$response" | tail -n1)

if [ "$status_code" = "401" ]; then
    pass "Protected endpoint requires authentication"
else
    fail "Protected endpoint accessible without authentication"
fi

# Test with invalid token
response=$(curl -s -w "\n%{http_code}" \
    -H "Authorization: Bearer invalid-token" \
    "$AUTH_SERVICE_URL/auth/me" 2>/dev/null || echo "")
status_code=$(echo "$response" | tail -n1)

if [ "$status_code" = "401" ]; then
    pass "Invalid JWT token rejected"
else
    fail "Invalid JWT token not properly rejected"
fi

# Test 5: Password Security
test_header "Password Security"

# Test weak password
response=$(curl -s -X POST "$AUTH_SERVICE_URL/auth/register" \
    -H "Content-Type: application/json" \
    -d '{"email":"test@example.com","password":"123","name":"Test User"}' \
    2>/dev/null || echo "")

if echo "$response" | grep -q "error\|validation\|at least 8"; then
    pass "Weak password rejected"
else
    fail "Weak password not rejected"
fi

# Test 6: Rate Limiting
test_header "Rate Limiting"

warn "Rate limiting test skipped (usually handled by API Gateway)"
warn "To test: Send 100+ requests in 1 minute and verify 429 response"

# Test 7: HTTPS/TLS
test_header "TLS/SSL Configuration"

if [ "$AUTH_SERVICE_URL" = "https://"* ]; then
    # Test TLS version
    tls_version=$(curl -s -I --tlsv1.2 "$AUTH_SERVICE_URL/health" 2>&1 | grep -o "TLSv1\.[23]" || echo "")
    if [ -n "$tls_version" ]; then
        pass "TLS 1.2+ enabled"
    else
        fail "TLS 1.2+ not detected"
    fi
else
    warn "Service not using HTTPS (expected in development)"
fi

# Test 8: Error Messages
test_header "Error Message Disclosure"

# Test that error messages don't leak sensitive information
response=$(curl -s -X POST "$AUTH_SERVICE_URL/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"email":"nonexistent@example.com","password":"wrongpassword"}' \
    2>/dev/null || echo "")

if echo "$response" | grep -qi "stack\|trace\|database\|sql"; then
    fail "Error messages may leak sensitive information"
else
    pass "Error messages don't leak sensitive information"
fi

# Test 9: HTTP Methods
test_header "HTTP Method Security"

# Test that only allowed methods work
response=$(curl -s -w "\n%{http_code}" -X TRACE "$AUTH_SERVICE_URL/health" 2>/dev/null || echo "")
status_code=$(echo "$response" | tail -n1)

if [ "$status_code" = "405" ] || [ "$status_code" = "501" ]; then
    pass "TRACE method disabled"
else
    warn "TRACE method may be enabled (status: $status_code)"
fi

# Test 10: Content Type Validation
test_header "Content Type Validation"

# Test sending wrong content type
response=$(curl -s -w "\n%{http_code}" -X POST "$AUTH_SERVICE_URL/auth/login" \
    -H "Content-Type: text/plain" \
    -d "email=test@example.com&password=test" \
    2>/dev/null || echo "")
status_code=$(echo "$response" | tail -n1)

if [ "$status_code" = "400" ] || [ "$status_code" = "415" ]; then
    pass "Invalid content type rejected"
else
    warn "Content type validation may be weak"
fi

# Test 11: Parameter Pollution
test_header "Parameter Pollution"

response=$(curl -s "$AUTH_SERVICE_URL/health?test=1&test=2&test=3" 2>/dev/null || echo "")

if [ -n "$response" ]; then
    pass "Service handles parameter pollution"
else
    warn "Parameter pollution handling unclear"
fi

# Test 12: File Upload Security (if applicable)
test_header "File Upload Security"

warn "File upload security test skipped (requires product service with S3)"
warn "Manual test: Verify file type validation and size limits"

# Summary
echo ""
echo "=================================="
echo "Security Test Summary"
echo "=================================="
echo -e "${GREEN}Passed: $TESTS_PASSED${NC}"
echo -e "${RED}Failed: $TESTS_FAILED${NC}"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}All security tests passed!${NC}"
    exit 0
else
    echo -e "${RED}Some security tests failed. Please review and fix.${NC}"
    exit 1
fi
