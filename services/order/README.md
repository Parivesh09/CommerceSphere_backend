# Order Service

The Order Service manages the complete order lifecycle from creation to fulfillment. It handles order creation, status management, cancellation, and orchestrates the order saga pattern for distributed transactions.

## Features

- **Order Creation**: Create new orders with multiple items
- **Order Retrieval**: Get order details and list user orders with pagination
- **Order Cancellation**: Cancel orders with compensation logic
- **Status Management**: Update order status through the order lifecycle
- **Event Publishing**: Publish order events to Kafka for event-driven workflows
- **Saga Orchestration**: Track saga state for distributed transactions

## API Endpoints

### POST /orders
Create a new order.

**Request Body:**
```json
{
  "userId": "uuid",
  "items": [
    {
      "productId": "uuid",
      "variantId": "uuid (optional)",
      "quantity": 2,
      "unitPrice": 29.99
    }
  ],
  "shippingAddress": {
    "street": "123 Main St",
    "city": "San Francisco",
    "state": "CA",
    "postalCode": "94102",
    "country": "USA"
  }
}
```

**Response:** `201 Created`
```json
{
  "order": {
    "id": "uuid",
    "userId": "uuid",
    "status": "CREATED",
    "totalAmount": 59.98,
    "paymentStatus": "PENDING",
    "shippingAddress": { ... },
    "items": [ ... ],
    "createdAt": "2024-01-15T10:30:00Z",
    "updatedAt": "2024-01-15T10:30:00Z"
  }
}
```

### GET /orders
List user orders with pagination.

**Query Parameters:**
- `userId` (required): User ID
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 20, max: 100)

**Response:** `200 OK`
```json
{
  "orders": [ ... ],
  "total": 50,
  "page": 1,
  "limit": 20
}
```

### GET /orders/:id
Get order details by ID.

**Query Parameters:**
- `userId` (optional): Filter by user ID

**Response:** `200 OK`
```json
{
  "order": { ... }
}
```

### POST /orders/:id/cancel
Cancel an order.

**Request Body:**
```json
{
  "userId": "uuid",
  "reason": "Changed my mind (optional)"
}
```

**Response:** `200 OK`
```json
{
  "order": { ... }
}
```

### PUT /orders/:id/status (Internal)
Update order status.

**Request Body:**
```json
{
  "status": "PAID"
}
```

**Response:** `200 OK`
```json
{
  "message": "Order status updated successfully"
}
```

## Order Status Flow

```
CREATED → PENDING_PAYMENT → PAID → PROCESSING → SHIPPED → DELIVERED
            ↓
        CANCELLED
```

## Events Published

- `order.created` - When a new order is created
- `order.cancelled` - When an order is cancelled
- `order.paid` - When payment is completed
- `order.shipped` - When order is shipped
- `order.delivered` - When order is delivered

## Database Schema

### orders
- `id` (UUID, PK)
- `user_id` (UUID)
- `status` (VARCHAR)
- `total_amount` (DECIMAL)
- `payment_status` (VARCHAR)
- `shipping_address` (JSONB)
- `created_at` (TIMESTAMP)
- `updated_at` (TIMESTAMP)

### order_items
- `id` (UUID, PK)
- `order_id` (UUID, FK)
- `product_id` (UUID)
- `variant_id` (UUID, nullable)
- `quantity` (INTEGER)
- `unit_price` (DECIMAL)
- `subtotal` (DECIMAL)
- `created_at` (TIMESTAMP)

### order_saga_state
- `id` (UUID, PK)
- `order_id` (UUID, FK, UNIQUE)
- `current_step` (VARCHAR)
- `completed_steps` (JSONB)
- `compensation_needed` (BOOLEAN)
- `created_at` (TIMESTAMP)
- `updated_at` (TIMESTAMP)

## Environment Variables

See `.env.example` for required environment variables:

- `PORT` - Service port (default: 3003)
- `NODE_ENV` - Environment (development/production)
- `DB_HOST` - PostgreSQL host
- `DB_PORT` - PostgreSQL port
- `DB_NAME` - Database name
- `DB_USER` - Database user
- `DB_PASSWORD` - Database password
- `KAFKA_BROKERS` - Kafka broker addresses
- `KAFKA_CLIENT_ID` - Kafka client ID

## Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Build
npm run build

# Start production server
npm start
```

## Health Checks

- `GET /health` - Basic health check
- `GET /ready` - Readiness check (includes database connectivity)
