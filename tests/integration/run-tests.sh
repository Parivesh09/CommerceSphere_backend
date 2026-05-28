#!/bin/bash

# Integration Test Runner for CommerceSphere
# This script runs integration tests with Testcontainers

set -e

echo "========================================="
echo "CommerceSphere Integration Tests"
echo "========================================="
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "Error: Docker is not running. Please start Docker and try again."
    exit 1
fi

# Navigate to integration tests directory
cd "$(dirname "$0")"

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
    echo ""
fi

# Set test environment variables
export NODE_ENV=test
export LOG_LEVEL=error

# Parse command line arguments
TEST_FILE=""
VERBOSE=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --test)
            TEST_FILE="$2"
            shift 2
            ;;
        --verbose)
            VERBOSE="--verbose"
            shift
            ;;
        --help)
            echo "Usage: ./run-tests.sh [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --test <file>    Run specific test file"
            echo "  --verbose        Run with verbose output"
            echo "  --help           Show this help message"
            echo ""
            echo "Examples:"
            echo "  ./run-tests.sh                                    # Run all tests"
            echo "  ./run-tests.sh --test order-flow.test.ts         # Run specific test"
            echo "  ./run-tests.sh --verbose                         # Run with verbose output"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

# Run tests
echo "Starting integration tests..."
echo "Note: This will start Docker containers and may take several minutes."
echo ""

if [ -n "$TEST_FILE" ]; then
    echo "Running test: $TEST_FILE"
    npm test -- "src/tests/$TEST_FILE" $VERBOSE
else
    echo "Running all integration tests..."
    npm test $VERBOSE
fi

echo ""
echo "========================================="
echo "Integration tests completed!"
echo "========================================="
