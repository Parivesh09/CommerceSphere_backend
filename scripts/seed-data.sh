#!/bin/bash

# CommerceSphere Data Seeding Script
# This script creates dummy users, an admin, and sample products

set -e

API_GATEWAY="http://localhost:3000"
AUTH_SERVICE="http://localhost:3001"
PRODUCT_SERVICE="http://localhost:3002"

echo "🌱 Starting CommerceSphere Data Seeding..."
echo "=========================================="

# Colors for output
GREEN='\033[0.32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

# Wait for services to be ready
print_info "Waiting for services to be ready..."
sleep 5

# 1. Create Admin User
print_info "Creating admin user..."
ADMIN_RESPONSE=$(curl -s -X POST "$API_GATEWAY/auth/register" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@commercesphere.com",
    "password": "Admin@123456",
    "name": "Admin User"
  }')

if echo "$ADMIN_RESPONSE" | grep -q '"id"'; then
    print_success "Admin user created successfully"
    echo "   Email: admin@commercesphere.com"
    echo "   Password: Admin@123456"
    
    # Login to get token
    print_info "Logging in as admin..."
    ADMIN_LOGIN=$(curl -s -X POST "$API_GATEWAY/auth/login" \
      -H "Content-Type: application/json" \
      -d '{
        "email": "admin@commercesphere.com",
        "password": "Admin@123456"
      }')
    
    if echo "$ADMIN_LOGIN" | grep -q "accessToken"; then
        ADMIN_TOKEN=$(echo "$ADMIN_LOGIN" | grep -o '"accessToken":"[^"]*' | cut -d'"' -f4)
        print_success "Admin logged in successfully"
        echo "   Token: ${ADMIN_TOKEN:0:50}..."
    fi
else
    print_warning "Admin user might already exist, trying to login..."
    ADMIN_LOGIN=$(curl -s -X POST "$API_GATEWAY/auth/login" \
      -H "Content-Type: application/json" \
      -d '{
        "email": "admin@commercesphere.com",
        "password": "Admin@123456"
      }')
    
    if echo "$ADMIN_LOGIN" | grep -q "accessToken"; then
        ADMIN_TOKEN=$(echo "$ADMIN_LOGIN" | grep -o '"accessToken":"[^"]*' | cut -d'"' -f4)
        print_success "Admin logged in successfully"
        echo "   Token: ${ADMIN_TOKEN:0:50}..."
    fi
fi

# 2. Create Regular Users
print_info "Creating regular users..."

USERS=(
    '{"email":"john.doe@example.com","password":"User@123456","name":"John Doe"}'
    '{"email":"jane.smith@example.com","password":"User@123456","name":"Jane Smith"}'
    '{"email":"bob.wilson@example.com","password":"User@123456","name":"Bob Wilson"}'
    '{"email":"alice.johnson@example.com","password":"User@123456","name":"Alice Johnson"}'
    '{"email":"charlie.brown@example.com","password":"User@123456","name":"Charlie Brown"}'
)

USER_TOKENS=()

for user_data in "${USERS[@]}"; do
    email=$(echo "$user_data" | grep -o '"email":"[^"]*' | cut -d'"' -f4)
    USER_RESPONSE=$(curl -s -X POST "$API_GATEWAY/auth/register" \
      -H "Content-Type: application/json" \
      -d "$user_data")
    
    if echo "$USER_RESPONSE" | grep -q "accessToken"; then
        USER_TOKEN=$(echo "$USER_RESPONSE" | grep -o '"accessToken":"[^"]*' | cut -d'"' -f4)
        USER_TOKENS+=("$USER_TOKEN")
        print_success "User created: $email"
    else
        print_warning "User $email might already exist"
    fi
done

# 3. Create Categories and Sample Products (using admin token)
print_info "Creating product categories..."

if [ -n "$ADMIN_TOKEN" ]; then
    CATEGORIES=(
        '{"name":"Electronics","slug":"electronics"}'
        '{"name":"Clothing","slug":"clothing"}'
        '{"name":"Home & Kitchen","slug":"home-kitchen"}'
        '{"name":"Sports","slug":"sports"}'
        '{"name":"Accessories","slug":"accessories"}'
        '{"name":"Home & Office","slug":"home-office"}'
    )
    
    CATEGORY_IDS=()
    
    for category_data in "${CATEGORIES[@]}"; do
        name=$(echo "$category_data" | grep -o '"name":"[^"]*' | cut -d'"' -f4)
        slug=$(echo "$category_data" | grep -o '"slug":"[^"]*' | cut -d'"' -f4)
        CATEGORY_RESPONSE=$(curl -s -X POST "$PRODUCT_SERVICE/categories" \
          -H "Content-Type: application/json" \
          -H "Authorization: Bearer $ADMIN_TOKEN" \
          -d "$category_data")
        
        if echo "$CATEGORY_RESPONSE" | grep -q '"id"'; then
            CATEGORY_ID=$(echo "$CATEGORY_RESPONSE" | grep -o '"id":"[^"]*' | cut -d'"' -f4)
            CATEGORY_IDS+=("$CATEGORY_ID")
            print_success "Category created: $name (ID: ${CATEGORY_ID:0:8}...)"
        elif echo "$CATEGORY_RESPONSE" | grep -q 'already exists'; then
            CATEGORY_ID=$(curl -s "$PRODUCT_SERVICE/categories" | python3 -c 'import json,sys; data=json.load(sys.stdin); print(next((c["id"] for c in data if c.get("slug") == sys.argv[1]), ""))' "$slug")
            if [ -n "$CATEGORY_ID" ]; then
                CATEGORY_IDS+=("$CATEGORY_ID")
                print_success "Category already exists: $name (ID: ${CATEGORY_ID:0:8}...)"
            else
                print_warning "Could not resolve existing category: $name"
            fi
        else
            print_warning "Failed to create category: $name"
            echo "   Response: $CATEGORY_RESPONSE"
        fi
    done
    
    # Wait a moment for categories to be available
    sleep 2
    
    print_info "Creating sample products..."
    
    # Get category IDs (assuming they were created in order)
    ELECTRONICS_ID="${CATEGORY_IDS[0]}"
    CLOTHING_ID="${CATEGORY_IDS[1]}"
    HOME_KITCHEN_ID="${CATEGORY_IDS[2]}"
    SPORTS_ID="${CATEGORY_IDS[3]}"
    ACCESSORIES_ID="${CATEGORY_IDS[4]}"
    HOME_OFFICE_ID="${CATEGORY_IDS[5]}"
    
    PRODUCTS=(
        "{\"title\":\"Wireless Bluetooth Headphones\",\"description\":\"Premium noise-cancelling headphones with 30-hour battery life\",\"price\":129.99,\"categoryId\":\"$ELECTRONICS_ID\",\"inventoryQuantity\":50,\"status\":\"active\"}"
        "{\"title\":\"Smart Fitness Watch\",\"description\":\"Track your health and fitness with GPS and heart rate monitoring\",\"price\":199.99,\"categoryId\":\"$ELECTRONICS_ID\",\"inventoryQuantity\":30,\"status\":\"active\"}"
        "{\"title\":\"Organic Cotton T-Shirt\",\"description\":\"Comfortable and sustainable everyday wear\",\"price\":29.99,\"categoryId\":\"$CLOTHING_ID\",\"inventoryQuantity\":100,\"status\":\"active\"}"
        "{\"title\":\"Stainless Steel Water Bottle\",\"description\":\"Keep your drinks cold for 24 hours or hot for 12 hours\",\"price\":34.99,\"categoryId\":\"$HOME_KITCHEN_ID\",\"inventoryQuantity\":75,\"status\":\"active\"}"
        "{\"title\":\"Yoga Mat Premium\",\"description\":\"Non-slip eco-friendly yoga mat with carrying strap\",\"price\":49.99,\"categoryId\":\"$SPORTS_ID\",\"inventoryQuantity\":40,\"status\":\"active\"}"
        "{\"title\":\"Laptop Backpack\",\"description\":\"Durable backpack with padded laptop compartment\",\"price\":79.99,\"categoryId\":\"$ACCESSORIES_ID\",\"inventoryQuantity\":60,\"status\":\"active\"}"
        "{\"title\":\"Wireless Mouse\",\"description\":\"Ergonomic wireless mouse with precision tracking\",\"price\":39.99,\"categoryId\":\"$ELECTRONICS_ID\",\"inventoryQuantity\":80,\"status\":\"active\"}"
        "{\"title\":\"Coffee Maker\",\"description\":\"Programmable coffee maker with thermal carafe\",\"price\":89.99,\"categoryId\":\"$HOME_KITCHEN_ID\",\"inventoryQuantity\":25,\"status\":\"active\"}"
        "{\"title\":\"Running Shoes\",\"description\":\"Lightweight running shoes with superior cushioning\",\"price\":119.99,\"categoryId\":\"$SPORTS_ID\",\"inventoryQuantity\":45,\"status\":\"active\"}"
        "{\"title\":\"Desk Lamp LED\",\"description\":\"Adjustable LED desk lamp with USB charging port\",\"price\":44.99,\"categoryId\":\"$HOME_OFFICE_ID\",\"inventoryQuantity\":55,\"status\":\"active\"}"
    )
    
    for product_data in "${PRODUCTS[@]}"; do
        title=$(echo "$product_data" | grep -o '"title":"[^"]*' | cut -d'"' -f4)
        PRODUCT_RESPONSE=$(curl -s -X POST "$PRODUCT_SERVICE/products" \
          -H "Content-Type: application/json" \
          -H "Authorization: Bearer $ADMIN_TOKEN" \
          -d "$product_data")
        
        if echo "$PRODUCT_RESPONSE" | grep -q '"id"'; then
            print_success "Product created: $title"
        else
            print_warning "Failed to create product: $title"
            echo "   Response: $PRODUCT_RESPONSE"
        fi
    done
else
    print_warning "Skipping product creation (no admin token available)"
fi

echo ""
echo "=========================================="
echo "🎉 Data Seeding Complete!"
echo "=========================================="
echo ""
echo "📝 Summary:"
echo "   - Admin User: admin@commercesphere.com (Password: Admin@123456)"
echo "   - Regular Users: 5 users created"
echo "   - Products: 10 sample products created"
echo ""
echo "🔗 API Endpoints:"
echo "   - API Gateway: $API_GATEWAY"
echo "   - Auth Service: $AUTH_SERVICE"
echo "   - Product Service: $PRODUCT_SERVICE"
echo ""
echo "🧪 Test the APIs:"
echo "   curl $API_GATEWAY/health"
echo "   curl $API_GATEWAY/products"
echo ""
