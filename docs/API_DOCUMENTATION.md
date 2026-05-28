# API Documentation

## Overview

CommerceSphere provides RESTful APIs for all microservices. All APIs follow consistent patterns for authentication, error handling, and response formats.

## Base URLs

### Local Development
- API Gateway: `http://localhost:8080`
- Auth Service: `http://localhost:3001`
- Product Service: `http://localhost:3002`
- Order Service: `http://localhost:3003`
- Payment Service: `http://localhost:3004`
- Notification Service: `http://localhost:3005`
- Search Service: `http://localhost:3006`
- Recommendation Service: `http://localhost:3007`
- Analytics Service: `http://localhost:3008`

### Production
- API Gateway: `https://api.commercesphere.com`

## Authentication

Most endpoints require JWT authentication. Include the access token in the Authorization header:

```http
Authorization: Bearer <access_token>
```

### Token Lifetimes
- Access Token: 1 hour
- Refresh Token: 7 days

## Common Headers

```http
Content-Type: application/json
Authorization: Bearer <access_token>
X-Correlation-ID: <optional-correlation-id>
```

## Response Format

### Success Response
```json
{
  "data": { ... },
  "meta": {
    "timestamp": "2024-01-15T10:30:00.000Z",
    "correlationId": "abc-123-def"
  }
}
```

### Error Response
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input data",
    "details": {
      "email": "Invalid email format"
    },
    "timestamp": "2024-01-15T10:30:00.000Z",
    "path": "/auth/register",
    "correlationId": "abc-123-def"
  }
}
```

## HTTP Status Codes

- `200 OK` - Request succeeded
- `201 Created` - Resource created successfully
- `204 No Content` - Request succeeded with no response body
- `400 Bad Request` - Invalid input or validation error
- `401 Unauthorized` - Missing or invalid authentication
- `403 Forbidden` - Insufficient permissions
- `404 Not Found` - Resource not found
- `409 Conflict` - Resource conflict (e.g., duplicate email)
- `422 Unprocessable Entity` - Business logic validation failure
- `429 Too Many Requests` - Rate limit exceeded
- `500 Internal Server Error` - Unexpected server error
- `503 Service Unavailable` - Service temporarily unavailable

## Pagination

List endpoints support pagination using query parameters:

```http
GET /products?page=1&limit=20
```

**Response:**
```json
{
  "data": [...],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "totalPages": 8
  }
}
```

## Rate Limiting

- **Limit:** 100 requests per minute per user
- **Headers:**
  - `X-RateLimit-Limit`: Maximum requests per window
  - `X-RateLimit-Remaining`: Remaining requests in current window
  - `X-RateLimit-Reset`: Unix timestamp when the window resets

---

## Auth Service API

### Register User

Create a new user account.

**Endpoint:** `POST /auth/register`

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123!",
  "name": "John Doe"
}
```

**Response:** `201 Created`
```json
{
  "data": {
    "user": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "email": "user@example.com",
      "name": "John Doe",
      "role": "customer",
      "createdAt": "2024-01-15T10:30:00.000Z"
    },
    "tokens": {
      "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "expiresIn": 3600
    }
  }
}
```

**Errors:**
- `400` - Invalid input (weak password, invalid email)
- `409` - Email already registered

---

### Login

Authenticate and receive access tokens.

**Endpoint:** `POST /auth/login`

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123!"
}
```

**Response:** `200 OK`
```json
{
  "data": {
    "user": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "email": "user@example.com",
      "name": "John Doe",
      "role": "customer"
    },
    "tokens": {
      "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "expiresIn": 3600
    }
  }
}
```

**Errors:**
- `401` - Invalid credentials

---

### Refresh Token

Get a new access token using a refresh token.

**Endpoint:** `POST /auth/refresh`

**Request Body:**
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Response:** `200 OK`
```json
{
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresIn": 3600
  }
}
```

**Errors:**
- `401` - Invalid or expired refresh token

---

### Get Current User

Get the authenticated user's profile.

**Endpoint:** `GET /auth/me`

**Headers:** `Authorization: Bearer <access_token>`

**Response:** `200 OK`
```json
{
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "user@example.com",
    "name": "John Doe",
    "role": "customer",
    "createdAt": "2024-01-15T10:30:00.000Z"
  }
}
```

**Errors:**
- `401` - Invalid or missing token

---

### Request Password Reset

Request a password reset token.

**Endpoint:** `POST /auth/password-reset-request`

**Request Body:**
```json
{
  "email": "user@example.com"
}
```

**Response:** `200 OK`
```json
{
  "data": {
    "message": "Password reset email sent"
  }
}
```

---

### Complete Password Reset

Reset password using the reset token.

**Endpoint:** `POST /auth/password-reset`

**Request Body:**
```json
{
  "token": "reset-token-from-email",
  "newPassword": "NewSecurePass123!"
}
```

**Response:** `200 OK`
```json
{
  "data": {
    "message": "Password reset successful"
  }
}
```

**Errors:**
- `400` - Invalid or expired token
- `400` - Weak password

---

## Product Service API

### List Products

Get a paginated list of products.

**Endpoint:** `GET /products`

**Query Parameters:**
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 20, max: 100)
- `category` (optional): Filter by category ID
- `status` (optional): Filter by status (active, inactive, out_of_stock)
- `minPrice` (optional): Minimum price filter
- `maxPrice` (optional): Maximum price filter

**Response:** `200 OK`
```json
{
  "data": [
    {
      "id": "prod-123",
      "title": "Wireless Headphones",
      "description": "High-quality wireless headphones",
      "price": 99.99,
      "categoryId": "cat-456",
      "inventoryQuantity": 50,
      "status": "active",
      "images": [
        {
          "id": "img-789",
          "url": "https://cdn.commercesphere.com/products/img-789.jpg",
          "displayOrder": 0
        }
      ],
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-01-15T10:30:00.000Z"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "totalPages": 8
  }
}
```

---

### Get Product

Get details of a specific product.

**Endpoint:** `GET /products/:id`

**Response:** `200 OK`
```json
{
  "data": {
    "id": "prod-123",
    "title": "Wireless Headphones",
    "description": "High-quality wireless headphones with noise cancellation",
    "price": 99.99,
    "categoryId": "cat-456",
    "inventoryQuantity": 50,
    "status": "active",
    "images": [
      {
        "id": "img-789",
        "url": "https://cdn.commercesphere.com/products/img-789.jpg",
        "displayOrder": 0
      }
    ],
    "variants": [
      {
        "id": "var-001",
        "sku": "WH-BLK-001",
        "attributes": {
          "color": "Black",
          "size": "Standard"
        },
        "price": 99.99,
        "inventoryQuantity": 30
      }
    ],
    "createdAt": "2024-01-15T10:30:00.000Z",
    "updatedAt": "2024-01-15T10:30:00.000Z"
  }
}
```

**Errors:**
- `404` - Product not found

---

### Create Product (Admin)

Create a new product.

**Endpoint:** `POST /products`

**Headers:** `Authorization: Bearer <admin_access_token>`

**Request Body:**
```json
{
  "title": "Wireless Headphones",
  "description": "High-quality wireless headphones",
  "price": 99.99,
  "categoryId": "cat-456",
  "inventoryQuantity": 50,
  "status": "active"
}
```

**Response:** `201 Created`
```json
{
  "data": {
    "id": "prod-123",
    "title": "Wireless Headphones",
    "description": "High-quality wireless headphones",
    "price": 99.99,
    "categoryId": "cat-456",
    "inventoryQuantity": 50,
    "status": "active",
    "images": [],
    "createdAt": "2024-01-15T10:30:00.000Z",
    "updatedAt": "2024-01-15T10:30:00.000Z"
  }
}
```

**Errors:**
- `400` - Invalid input
- `403` - Insufficient permissions

---

### Update Product (Admin)

Update an existing product.

**Endpoint:** `PUT /products/:id`

**Headers:** `Authorization: Bearer <admin_access_token>`

**Request Body:**
```json
{
  "price": 89.99,
  "inventoryQuantity": 75
}
```

**Response:** `200 OK`
```json
{
  "data": {
    "id": "prod-123",
    "title": "Wireless Headphones",
    "price": 89.99,
    "inventoryQuantity": 75,
    "updatedAt": "2024-01-15T11:00:00.000Z"
  }
}
```

**Errors:**
- `404` - Product not found
- `403` - Insufficient permissions

---

### Get Image Upload URL

Get a pre-signed URL for uploading product images.

**Endpoint:** `POST /products/:id/images/upload-url`

**Headers:** `Authorization: Bearer <admin_access_token>`

**Request Body:**
```json
{
  "fileName": "product-image.jpg",
  "contentType": "image/jpeg"
}
```

**Response:** `200 OK`
```json
{
  "data": {
    "uploadUrl": "https://s3.amazonaws.com/bucket/...",
    "imageId": "img-789",
    "expiresIn": 3600
  }
}
```

---

## Order Service API

### Create Order

Create a new order.

**Endpoint:** `POST /orders`

**Headers:** `Authorization: Bearer <access_token>`

**Request Body:**
```json
{
  "items": [
    {
      "productId": "prod-123",
      "variantId": "var-001",
      "quantity": 2,
      "unitPrice": 99.99
    }
  ],
  "shippingAddress": {
    "street": "123 Main St",
    "city": "San Francisco",
    "state": "CA",
    "postalCode": "94102",
    "country": "US"
  }
}
```

**Response:** `201 Created`
```json
{
  "data": {
    "id": "order-456",
    "userId": "user-123",
    "status": "CREATED",
    "totalAmount": 199.98,
    "paymentStatus": "PENDING",
    "items": [
      {
        "id": "item-789",
        "productId": "prod-123",
        "variantId": "var-001",
        "quantity": 2,
        "unitPrice": 99.99,
        "subtotal": 199.98
      }
    ],
    "shippingAddress": {
      "street": "123 Main St",
      "city": "San Francisco",
      "state": "CA",
      "postalCode": "94102",
      "country": "US"
    },
    "createdAt": "2024-01-15T10:30:00.000Z"
  }
}
```

**Errors:**
- `400` - Invalid input
- `422` - Insufficient inventory
- `401` - Not authenticated

---

### List Orders

Get user's orders.

**Endpoint:** `GET /orders`

**Headers:** `Authorization: Bearer <access_token>`

**Query Parameters:**
- `page` (optional): Page number
- `limit` (optional): Items per page
- `status` (optional): Filter by status

**Response:** `200 OK`
```json
{
  "data": [
    {
      "id": "order-456",
      "status": "PAID",
      "totalAmount": 199.98,
      "paymentStatus": "COMPLETED",
      "createdAt": "2024-01-15T10:30:00.000Z"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 5,
    "totalPages": 1
  }
}
```

---

### Get Order

Get order details.

**Endpoint:** `GET /orders/:id`

**Headers:** `Authorization: Bearer <access_token>`

**Response:** `200 OK`
```json
{
  "data": {
    "id": "order-456",
    "userId": "user-123",
    "status": "PAID",
    "totalAmount": 199.98,
    "paymentStatus": "COMPLETED",
    "items": [...],
    "shippingAddress": {...},
    "createdAt": "2024-01-15T10:30:00.000Z",
    "updatedAt": "2024-01-15T10:35:00.000Z"
  }
}
```

**Errors:**
- `404` - Order not found
- `403` - Not authorized to view this order

---

### Cancel Order

Cancel an order.

**Endpoint:** `POST /orders/:id/cancel`

**Headers:** `Authorization: Bearer <access_token>`

**Response:** `200 OK`
```json
{
  "data": {
    "id": "order-456",
    "status": "CANCELLED",
    "updatedAt": "2024-01-15T11:00:00.000Z"
  }
}
```

**Errors:**
- `404` - Order not found
- `422` - Order cannot be cancelled (already shipped)

---

## Payment Service API

### Create Payment

Initiate a payment for an order.

**Endpoint:** `POST /payments`

**Headers:** `Authorization: Bearer <access_token>`

**Request Body:**
```json
{
  "orderId": "order-456",
  "amount": 199.98,
  "currency": "USD",
  "paymentMethod": "card",
  "paymentDetails": {
    "token": "stripe_token_here"
  }
}
```

**Response:** `201 Created`
```json
{
  "data": {
    "id": "pay-789",
    "orderId": "order-456",
    "amount": 199.98,
    "currency": "USD",
    "status": "PENDING",
    "createdAt": "2024-01-15T10:30:00.000Z"
  }
}
```

---

### Get Payment Status

Get payment details.

**Endpoint:** `GET /payments/:id`

**Headers:** `Authorization: Bearer <access_token>`

**Response:** `200 OK`
```json
{
  "data": {
    "id": "pay-789",
    "orderId": "order-456",
    "amount": 199.98,
    "currency": "USD",
    "status": "COMPLETED",
    "paymentMethod": "card",
    "gatewayTransactionId": "ch_1234567890",
    "createdAt": "2024-01-15T10:30:00.000Z",
    "updatedAt": "2024-01-15T10:31:00.000Z"
  }
}
```

---

### Request Refund

Process a refund for a payment.

**Endpoint:** `POST /payments/:id/refund`

**Headers:** `Authorization: Bearer <admin_access_token>`

**Request Body:**
```json
{
  "amount": 199.98,
  "reason": "Customer request"
}
```

**Response:** `200 OK`
```json
{
  "data": {
    "id": "refund-123",
    "paymentId": "pay-789",
    "amount": 199.98,
    "status": "PENDING",
    "reason": "Customer request",
    "createdAt": "2024-01-15T11:00:00.000Z"
  }
}
```

---

## Search Service API

### Search Products

Search for products with filters.

**Endpoint:** `GET /search`

**Query Parameters:**
- `q` (required): Search query
- `category` (optional): Filter by category
- `minPrice` (optional): Minimum price
- `maxPrice` (optional): Maximum price
- `status` (optional): Filter by status
- `page` (optional): Page number
- `limit` (optional): Items per page
- `sort` (optional): Sort field (relevance, price, created_at)
- `order` (optional): Sort order (asc, desc)

**Response:** `200 OK`
```json
{
  "data": [
    {
      "id": "prod-123",
      "title": "Wireless Headphones",
      "description": "High-quality wireless headphones",
      "price": 99.99,
      "category": "Electronics",
      "status": "active",
      "score": 0.95
    }
  ],
  "meta": {
    "query": "wireless headphones",
    "total": 42,
    "page": 1,
    "limit": 20,
    "totalPages": 3
  }
}
```

---

### Autocomplete

Get autocomplete suggestions.

**Endpoint:** `GET /search/autocomplete`

**Query Parameters:**
- `q` (required): Partial search query
- `limit` (optional): Number of suggestions (default: 10)

**Response:** `200 OK`
```json
{
  "data": [
    {
      "text": "wireless headphones",
      "score": 0.95
    },
    {
      "text": "wireless earbuds",
      "score": 0.87
    }
  ]
}
```

---

## Recommendation Service API

### Get Personalized Recommendations

Get personalized product recommendations.

**Endpoint:** `GET /recommendations/personalized`

**Headers:** `Authorization: Bearer <access_token>`

**Query Parameters:**
- `limit` (optional): Number of recommendations (default: 10)

**Response:** `200 OK`
```json
{
  "data": [
    {
      "id": "prod-456",
      "title": "Wireless Earbuds",
      "price": 79.99,
      "score": 0.92,
      "reason": "Based on your purchase history"
    }
  ]
}
```

---

### Get Trending Products

Get trending products.

**Endpoint:** `GET /recommendations/trending`

**Query Parameters:**
- `limit` (optional): Number of products (default: 10)
- `category` (optional): Filter by category

**Response:** `200 OK`
```json
{
  "data": [
    {
      "id": "prod-789",
      "title": "Smart Watch",
      "price": 299.99,
      "trendingScore": 0.88
    }
  ]
}
```

---

### Get Similar Products

Get products similar to a specific product.

**Endpoint:** `GET /recommendations/similar/:productId`

**Query Parameters:**
- `limit` (optional): Number of recommendations (default: 10)

**Response:** `200 OK`
```json
{
  "data": [
    {
      "id": "prod-999",
      "title": "Premium Headphones",
      "price": 149.99,
      "similarityScore": 0.85
    }
  ]
}
```

---

## Analytics Service API

### Get Sales Analytics

Get sales analytics for a time period.

**Endpoint:** `GET /analytics/sales`

**Headers:** `Authorization: Bearer <admin_access_token>`

**Query Parameters:**
- `startDate` (required): Start date (ISO 8601)
- `endDate` (required): End date (ISO 8601)
- `granularity` (optional): hour, day, week, month (default: day)

**Response:** `200 OK`
```json
{
  "data": {
    "totalRevenue": 125000.00,
    "totalOrders": 1250,
    "averageOrderValue": 100.00,
    "conversionRate": 0.035,
    "timeSeries": [
      {
        "timestamp": "2024-01-15T00:00:00.000Z",
        "revenue": 5000.00,
        "orders": 50
      }
    ]
  }
}
```

---

### Get Top Products

Get top-selling products.

**Endpoint:** `GET /analytics/products/top`

**Headers:** `Authorization: Bearer <admin_access_token>`

**Query Parameters:**
- `startDate` (optional): Start date
- `endDate` (optional): End date
- `limit` (optional): Number of products (default: 10)

**Response:** `200 OK`
```json
{
  "data": [
    {
      "productId": "prod-123",
      "title": "Wireless Headphones",
      "totalSales": 15000.00,
      "unitsSold": 150,
      "views": 5000
    }
  ]
}
```

---

### Get Top Customers

Get top customers by spend.

**Endpoint:** `GET /analytics/customers/top`

**Headers:** `Authorization: Bearer <admin_access_token>`

**Query Parameters:**
- `limit` (optional): Number of customers (default: 10)

**Response:** `200 OK`
```json
{
  "data": [
    {
      "userId": "user-123",
      "name": "John Doe",
      "totalSpent": 5000.00,
      "totalOrders": 25,
      "lifetimeValue": 5500.00
    }
  ]
}
```

---

## OpenAPI/Swagger Specifications

Complete OpenAPI 3.0 specifications for each service are available at:

- Auth Service: `/docs/openapi/auth-service.yaml`
- Product Service: `/docs/openapi/product-service.yaml`
- Order Service: `/docs/openapi/order-service.yaml`
- Payment Service: `/docs/openapi/payment-service.yaml`
- Search Service: `/docs/openapi/search-service.yaml`
- Recommendation Service: `/docs/openapi/recommendation-service.yaml`
- Analytics Service: `/docs/openapi/analytics-service.yaml`

## Testing the API

### Using cURL

```bash
# Register a user
curl -X POST http://localhost:3001/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Test123!","name":"Test User"}'

# Login
curl -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Test123!"}'

# Get products (with auth)
curl -X GET http://localhost:3002/products \
  -H "Authorization: Bearer <access_token>"
```

### Using Postman

Import the Postman collection from `/docs/postman/CommerceSphere.postman_collection.json`

## Webhooks

### Payment Webhook

Stripe sends webhook events to the Payment Service.

**Endpoint:** `POST /payments/webhook`

**Headers:**
- `Stripe-Signature`: Webhook signature for verification

**Event Types:**
- `payment_intent.succeeded`
- `payment_intent.payment_failed`
- `charge.refunded`

## WebSocket API (Future)

Real-time features will be available via WebSocket connections:

- Order status updates
- Inventory updates
- Real-time notifications

**Connection:** `wss://api.commercesphere.com/ws`

## API Versioning

APIs are versioned using URL path versioning:

- Current: `/v1/products`
- Future: `/v2/products`

Breaking changes will be introduced in new versions while maintaining backward compatibility for at least 6 months.

## Support

For API support:
- Documentation: https://docs.commercesphere.com
- Issues: https://github.com/commercesphere/platform/issues
- Email: api-support@commercesphere.com
