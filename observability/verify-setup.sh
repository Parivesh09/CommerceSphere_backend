#!/bin/bash

# Observability Stack Verification Script
# This script verifies that all observability components are running correctly

set -e

echo "🔍 Verifying CommerceSphere Observability Stack..."
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to check if a service is healthy
check_service() {
    local name=$1
    local url=$2
    local expected_status=${3:-200}
    
    echo -n "Checking $name... "
    
    if response=$(curl -s -o /dev/null -w "%{http_code}" "$url" 2>/dev/null); then
        if [ "$response" -eq "$expected_status" ]; then
            echo -e "${GREEN}✓ OK${NC} (HTTP $response)"
            return 0
        else
            echo -e "${RED}✗ FAILED${NC} (HTTP $response, expected $expected_status)"
            return 1
        fi
    else
        echo -e "${RED}✗ FAILED${NC} (Connection failed)"
        return 1
    fi
}

# Function to check if a port is listening
check_port() {
    local name=$1
    local port=$2
    
    echo -n "Checking $name port $port... "
    
    if nc -z localhost "$port" 2>/dev/null; then
        echo -e "${GREEN}✓ OK${NC}"
        return 0
    else
        echo -e "${RED}✗ FAILED${NC} (Port not listening)"
        return 1
    fi
}

# Track failures
FAILURES=0

echo "📊 Checking Observability Services..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Check Prometheus
if check_service "Prometheus" "http://localhost:9090/-/healthy"; then
    :
else
    ((FAILURES++))
fi

# Check Grafana
if check_service "Grafana" "http://localhost:3001/api/health"; then
    :
else
    ((FAILURES++))
fi

# Check Elasticsearch
if check_service "Elasticsearch" "http://localhost:9200/_cluster/health"; then
    :
else
    ((FAILURES++))
fi

# Check Kibana
if check_service "Kibana" "http://localhost:5601/api/status" 200; then
    :
else
    ((FAILURES++))
fi

# Check Jaeger
if check_service "Jaeger UI" "http://localhost:16686/"; then
    :
else
    ((FAILURES++))
fi

echo ""
echo "🔌 Checking Ports..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

check_port "Prometheus" 9090 || ((FAILURES++))
check_port "Grafana" 3001 || ((FAILURES++))
check_port "Elasticsearch" 9200 || ((FAILURES++))
check_port "Logstash" 5000 || ((FAILURES++))
check_port "Kibana" 5601 || ((FAILURES++))
check_port "Jaeger UI" 16686 || ((FAILURES++))

echo ""
echo "📈 Checking Prometheus Targets..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if targets=$(curl -s "http://localhost:9090/api/v1/targets" 2>/dev/null); then
    active_targets=$(echo "$targets" | grep -o '"health":"up"' | wc -l)
    total_targets=$(echo "$targets" | grep -o '"health":' | wc -l)
    echo -e "Active targets: ${GREEN}$active_targets${NC} / $total_targets"
else
    echo -e "${RED}✗ Failed to fetch Prometheus targets${NC}"
    ((FAILURES++))
fi

echo ""
echo "📝 Checking Elasticsearch Indices..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if indices=$(curl -s "http://localhost:9200/_cat/indices/commercesphere-logs-*?h=index" 2>/dev/null); then
    if [ -n "$indices" ]; then
        count=$(echo "$indices" | wc -l)
        echo -e "Log indices found: ${GREEN}$count${NC}"
        echo "$indices" | head -5
    else
        echo -e "${YELLOW}⚠ No log indices found yet${NC}"
    fi
else
    echo -e "${RED}✗ Failed to fetch Elasticsearch indices${NC}"
    ((FAILURES++))
fi

echo ""
echo "🎯 Summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ $FAILURES -eq 0 ]; then
    echo -e "${GREEN}✓ All checks passed!${NC}"
    echo ""
    echo "🌐 Access URLs:"
    echo "  • Prometheus:    http://localhost:9090"
    echo "  • Grafana:       http://localhost:3001 (admin/admin)"
    echo "  • Kibana:        http://localhost:5601"
    echo "  • Jaeger:        http://localhost:16686"
    echo "  • Elasticsearch: http://localhost:9200"
    echo ""
    echo "📚 Documentation:"
    echo "  • README:         observability/README.md"
    echo "  • Setup Guide:    observability/SETUP_GUIDE.md"
    echo "  • Quick Ref:      observability/QUICK_REFERENCE.md"
    exit 0
else
    echo -e "${RED}✗ $FAILURES check(s) failed${NC}"
    echo ""
    echo "💡 Troubleshooting:"
    echo "  1. Ensure Docker Compose is running:"
    echo "     docker-compose -f docker-compose.observability.yml ps"
    echo ""
    echo "  2. Check service logs:"
    echo "     docker-compose -f docker-compose.observability.yml logs [service]"
    echo ""
    echo "  3. Restart services:"
    echo "     docker-compose -f docker-compose.observability.yml restart"
    echo ""
    echo "  4. See documentation: observability/README.md"
    exit 1
fi
