# Analytics Service

The Analytics Service is responsible for collecting, aggregating, and analyzing business metrics across the CommerceSphere platform. It provides real-time metrics updates and historical analytics for orders, products, and customers.

## Features

- **Real-time Metrics Updates**: Processes events from Kafka to update metrics in real-time
- **Time-series Data**: Uses TimescaleDB for efficient time-series data storage and querying
- **Sales Analytics**: Provides revenue, order count, and average order value by time period
- **Product Analytics**: Tracks product views, purchases, and revenue
- **Customer Analytics**: Tracks customer lifetime value, total spend, and order history
- **Dashboard Summary**: Provides comprehensive dashboard with key metrics
- **Hourly Batch Aggregation**: Runs periodic aggregation for historical data processing

## Technology Stack

- **Runtime**: Node.js with TypeScript
- **Framework**: Express.js
- **Database**: PostgreSQL with TimescaleDB extension
- **Message Broker**: Apache Kafka
- **Shared Libraries**: @commercesphere/types, @commercesphere/utils

## Database Schema

### order_metrics (Hypertable)
- `timestamp`: Hour-level timestamp
- `total_orders`: Total number of orders in the time period
- `total_revenue`: Total revenue in the time period
- `average_order_value`: Average order value

### product_metrics (Hypertable)
- `timestamp`: Hour-level timestamp
- `product_id`: Product identifier
- `views`: Number of product views
- `purchases`: Number of purchases
- `revenue`: Total revenue from the product

### user_metrics
- `user_id`: User identifier
- `total_orders`: Total number of orders placed by the user
- `total_spent`: Total amount spent by the user
- `lifetime_value`: Customer lifetime value
- `last_order_at`: Timestamp of the last order
- `updated_at`: Last update timestamp

## API Endpoints

### GET /analytics/sales
Get sales analytics by time period.

**Query Parameters:**
- `startDate` (optional): Start date (ISO 8601 format)
- `endDate` (optional): End date (ISO 8601 format)
- `interval` (optional): Time interval - `hour`, `day`, `week`, `month` (default: `day`)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "timestamp": "2024-01-15T00:00:00.000Z",
      "totalOrders": 150,
      "totalRevenue": 15000.00,
      "averageOrderValue": 100.00
    }
  ]
}
```

### GET /analytics/products/top
Get top selling products.

**Query Parameters:**
- `startDate` (optional): Start date (ISO 8601 format)
- `endDate` (optional): End date (ISO 8601 format)
- `limit` (optional): Number of products to return (default: 10)
- `sortBy` (optional): Sort by `revenue`, `purchases`, or `views` (default: `revenue`)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "productId": "uuid",
      "views": 1000,
      "purchases": 50,
      "revenue": 5000.00,
      "timestamp": "2024-01-15T00:00:00.000Z"
    }
  ]
}
```

### GET /analytics/customers/top
Get top customers by spend.

**Query Parameters:**
- `limit` (optional): Number of customers to return (default: 10)
- `sortBy` (optional): Sort by `total_spent`, `total_orders`, or `lifetime_value` (default: `total_spent`)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "userId": "uuid",
      "totalOrders": 25,
      "totalSpent": 2500.00,
      "lifetimeValue": 2500.00,
      "lastOrderAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-01-15T10:30:00.000Z"
    }
  ]
}
```

### GET /analytics/dashboard
Get dashboard summary with key metrics.

**Response:**
```json
{
  "success": true,
  "data": {
    "totalRevenue": 100000.00,
    "totalOrders": 1000,
    "averageOrderValue": 100.00,
    "topProducts": [...],
    "topCustomers": [...],
    "recentMetrics": {
      "last24Hours": {
        "revenue": 5000.00,
        "orders": 50
      },
      "last7Days": {
        "revenue": 35000.00,
        "orders": 350
      },
      "last30Days": {
        "revenue": 100000.00,
        "orders": 1000
      }
    }
  }
}
```

## Events Consumed

The Analytics Service consumes the following Kafka events:

- `order.created`: Updates order and product metrics
- `order.completed`: Updates order metrics
- `payment.success`: Tracks successful payments
- `product.viewed`: Updates product view metrics

## Environment Variables

See `.env.example` for required environment variables:

- `PORT`: Server port (default: 3008)
- `NODE_ENV`: Environment (development/production)
- `DB_HOST`: PostgreSQL host
- `DB_PORT`: PostgreSQL port
- `DB_NAME`: Database name
- `DB_USER`: Database user
- `DB_PASSWORD`: Database password
- `KAFKA_BROKERS`: Kafka broker addresses
- `KAFKA_CLIENT_ID`: Kafka client ID
- `KAFKA_GROUP_ID`: Kafka consumer group ID

## Running the Service

### Development
```bash
npm run dev
```

### Production
```bash
npm run build
npm start
```

## TimescaleDB Setup

The service requires TimescaleDB extension for PostgreSQL. The extension is automatically enabled during database initialization. If you're using a standard PostgreSQL instance, you'll need to install TimescaleDB:

```bash
# For Docker
docker run -d --name timescaledb -p 5432:5432 -e POSTGRES_PASSWORD=postgres timescale/timescaledb:latest-pg15

# For local installation, follow: https://docs.timescale.com/install/latest/
```

## Monitoring

The service exposes health check endpoints:

- `GET /health`: Basic health check
- `GET /ready`: Readiness check

## Architecture

The Analytics Service follows an event-driven architecture:

1. **Event Consumer**: Listens to Kafka topics for order, payment, and product events
2. **Real-time Updates**: Updates metrics immediately upon receiving events
3. **Time-series Storage**: Stores metrics in TimescaleDB hypertables for efficient querying
4. **Batch Aggregation**: Runs hourly aggregation for historical data processing
5. **REST API**: Provides endpoints for querying analytics data

## Performance Considerations

- **Hypertables**: TimescaleDB hypertables provide efficient time-series data storage
- **Indexes**: Optimized indexes for common query patterns
- **Aggregation**: Pre-aggregated metrics reduce query complexity
- **Caching**: Consider adding Redis caching for frequently accessed metrics
- **Partitioning**: TimescaleDB automatically partitions data by time

## Future Enhancements

- Add Redis caching for dashboard metrics
- Implement data retention policies
- Add more advanced analytics (cohort analysis, funnel analysis)
- Implement real-time dashboards with WebSocket
- Add machine learning models for predictive analytics
