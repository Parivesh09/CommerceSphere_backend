# Notification Service

The Notification Service is responsible for sending notifications to users via multiple channels (email, SMS, push notifications) based on events in the e-commerce platform.

## Features

- **Multi-channel notifications**: Email (SendGrid), SMS (Twilio), Push (Firebase Cloud Messaging)
- **Template system**: Predefined templates for different notification types
- **User preferences**: Respect user notification channel preferences
- **Retry logic**: Exponential backoff retry (3 attempts: 1 min, 5 min, 15 min)
- **Event-driven**: Consumes events from Kafka to trigger notifications
- **Notification history**: Track all sent notifications

## Architecture

The service consists of:
- **Express.js API**: REST endpoints for managing preferences and viewing history
- **Kafka Consumer**: Listens to order and payment events
- **Notification Channels**: Email, SMS, and Push notification providers
- **Template Engine**: Renders notification content with dynamic data
- **PostgreSQL Database**: Stores notifications and user preferences

## Database Schema

### notifications
- `id`: UUID primary key
- `user_id`: UUID of the recipient
- `type`: Notification type (ORDER_CREATED, PAYMENT_SUCCESS, etc.)
- `channel`: Delivery channel (email, sms, push)
- `subject`: Notification subject (for email/push)
- `content`: Notification content
- `status`: PENDING, SENT, or FAILED
- `retry_count`: Number of retry attempts
- `sent_at`: Timestamp when successfully sent
- `created_at`: Creation timestamp

### notification_preferences
- `id`: UUID primary key
- `user_id`: UUID (unique)
- `email_enabled`: Boolean (default: true)
- `sms_enabled`: Boolean (default: false)
- `push_enabled`: Boolean (default: true)
- `created_at`: Creation timestamp
- `updated_at`: Last update timestamp

## API Endpoints

### Get User Preferences
```
GET /notifications/preferences/:userId
```

### Update User Preferences
```
PUT /notifications/preferences/:userId
Body: {
  "emailEnabled": true,
  "smsEnabled": false,
  "pushEnabled": true
}
```

### Get Notification History
```
GET /notifications/history/:userId?limit=50
```

## Event Handlers

The service consumes the following Kafka events:

- `order.created` → ORDER_CREATED notification
- `payment.success` → PAYMENT_SUCCESS notification
- `order.shipped` → ORDER_SHIPPED notification
- `order.delivered` → ORDER_DELIVERED notification
- `order.cancelled` → ORDER_CANCELLED notification

## Notification Types

1. **ORDER_CREATED**: Sent when an order is placed
2. **PAYMENT_SUCCESS**: Sent when payment is confirmed
3. **ORDER_SHIPPED**: Sent when order is shipped with tracking info
4. **ORDER_DELIVERED**: Sent when order is delivered
5. **ORDER_CANCELLED**: Sent when order is cancelled
6. **PASSWORD_RESET**: Sent for password reset requests

## Configuration

Required environment variables:

```bash
# Server
PORT=3006
NODE_ENV=development

# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/notification_db

# Kafka
KAFKA_BROKERS=localhost:9092
KAFKA_CLIENT_ID=notification-service
KAFKA_GROUP_ID=notification-service-group

# SendGrid (Email)
SENDGRID_API_KEY=your_api_key
SENDGRID_FROM_EMAIL=noreply@commercesphere.com
SENDGRID_FROM_NAME=CommerceSphere

# Twilio (SMS)
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE_NUMBER=+1234567890

# Firebase (Push)
FIREBASE_PROJECT_ID=your_project_id
FIREBASE_PRIVATE_KEY=your_private_key
FIREBASE_CLIENT_EMAIL=your_client_email
```

## Retry Logic

The service implements exponential backoff retry for failed notifications:

1. **First attempt**: Immediate
2. **Second attempt**: After 1 minute
3. **Third attempt**: After 5 minutes
4. **Fourth attempt**: After 15 minutes

After 3 retries (4 total attempts), the notification is marked as FAILED.

## Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Build
npm run build

# Run production
npm start
```

## Testing

The service can be tested by:
1. Publishing events to Kafka topics
2. Calling REST API endpoints
3. Checking notification status in the database

## Integration

To integrate with other services:

1. **Publish events** to Kafka topics (`orders`, `payments`)
2. **Include required fields** in event payload:
   - `userId`: Recipient user ID
   - `orderId`: Order ID (for order-related notifications)
   - `amount`: Order/payment amount
   - `trackingNumber`: Shipping tracking number (for shipped notifications)

## Requirements Validation

This implementation satisfies:
- **Requirement 6.1**: ORDER_CREATED event triggers order confirmation notification
- **Requirement 6.2**: PAYMENT_SUCCESS event triggers payment confirmation notification
- **Requirement 6.3**: Order status changes trigger shipping notifications
- **Requirement 6.4**: User notification preferences are respected
- **Requirement 6.5**: Failed notifications retry up to 3 times with exponential backoff
