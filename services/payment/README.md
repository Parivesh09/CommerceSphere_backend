# Payment Service

The Payment Service handles payment processing, refunds, and payment-related events for the CommerceSphere e-commerce platform.

## Features

- Payment processing via Stripe
- Refund management
- Webhook handling for payment events
- Event-driven architecture with Kafka
- Idempotent payment operations
- Automatic refund processing for cancelled orders

## Technology Stack

- **Runtime:** Node.js with TypeScript
- **Framework:** Express.js
- **Database:** PostgreSQL
- **Payment Gateway:** Stripe
- **Message Broker:** Apache Kafka
- **Logging:** Winston (via shared utils)

## API Endpoints

### POST /payments
Create a new payment.

**Request Body:**
```json
{
  "orderId": "uuid",
  "userId": "uuid",
  "amount": 99.99,
  "currency": "USD",
  "paymentMethodId": "pm_xxx"
}
```

**Response:** `201 Created`
```json
{
  "id": "uuid",
  "orderId": "uuid",
  "userId": "uuid",
  "amount": 99.99,
  "currency": "USD",
  "status": "PENDING",
  "createdAt": "2024-01-15T10:30:00.000Z"
}
```

### GET /payments/:id
Get payment status.

**Response:** `200 OK`
```json
{
  "id": "uuid",
  "orderId": "uuid",
  "userId": "uuid",
  "amount": 99.99,
  "currency": "USD",
  "status": "COMPLETED",
  "paymentMethod": "stripe",
  "gatewayTransactionId": "pi_xxx",
  "createdAt": "2024-01-15T10:30:00.000Z",
  "updatedAt": "2024-01-15T10:30:05.000Z"
}
```

### POST /payments/:id/refund
Process a refund.

**Request Body:**
```json
{
  "amount": 99.99,
  "reason": "Customer requested refund"
}
```

**Response:** `201 Created`
```json
{
  "id": "uuid",
  "paymentId": "uuid",
  "amount": 99.99,
  "reason": "Customer requested refund",
  "status": "PENDING",
  "createdAt": "2024-01-15T10:35:00.000Z"
}
```

### POST /payments/webhook
Handle Stripe webhooks (signature validation required).

**Headers:**
- `stripe-signature`: Stripe webhook signature

**Response:** `200 OK`
```json
{
  "received": true
}
```

## Events

### Consumed Events

- `order.created` - Logs order creation (payment initiated separately)
- `order.cancelled` - Automatically initiates refund if payment was completed

### Published Events

- `payment.success` - Payment completed successfully
- `payment.failed` - Payment processing failed
- `payment.refund_initiated` - Refund process started
- `payment.refund_completed` - Refund completed successfully

## Database Schema

### payments
```sql
CREATE TABLE payments (
  id UUID PRIMARY KEY,
  order_id UUID NOT NULL,
  user_id UUID NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'USD',
  status VARCHAR(50) DEFAULT 'PENDING',
  payment_method VARCHAR(50),
  gateway_transaction_id VARCHAR(255) UNIQUE,
  gateway_response JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### refunds
```sql
CREATE TABLE refunds (
  id UUID PRIMARY KEY,
  payment_id UUID REFERENCES payments(id),
  amount DECIMAL(10, 2) NOT NULL,
  reason TEXT,
  status VARCHAR(50) DEFAULT 'PENDING',
  gateway_refund_id VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW()
);
```

## Configuration

Copy `.env.example` to `.env` and configure:

```env
PORT=3004
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/payment_db
STRIPE_SECRET_KEY=sk_test_your_key
STRIPE_WEBHOOK_SECRET=whsec_your_secret
KAFKA_BROKERS=localhost:9092
```

## Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Build
npm run build

# Run production build
npm start
```

## Stripe Integration

### Setup
1. Create a Stripe account at https://stripe.com
2. Get your API keys from the Stripe Dashboard
3. Set up webhook endpoint in Stripe Dashboard pointing to `/payments/webhook`
4. Copy the webhook signing secret to `STRIPE_WEBHOOK_SECRET`

### Testing
Use Stripe test cards:
- Success: `4242 4242 4242 4242`
- Decline: `4000 0000 0000 0002`

### Webhook Events
The service handles these Stripe webhook events:
- `payment_intent.succeeded`
- `payment_intent.payment_failed`
- `charge.refunded`

## Idempotency

The service implements idempotency using:
- `gateway_transaction_id` as unique constraint
- Checking for existing payments by `order_id` before creating new ones

## Error Handling

All errors return a consistent format:
```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message",
    "timestamp": "2024-01-15T10:30:00.000Z",
    "path": "/payments",
    "correlationId": "uuid"
  }
}
```

## Monitoring

Key metrics to monitor:
- Payment success rate
- Payment processing time
- Refund processing time
- Webhook processing failures
- Database connection pool utilization

## Security

- Webhook signature verification using Stripe signing secret
- TLS for all external communications
- Sensitive data stored securely in database
- API keys managed via environment variables
