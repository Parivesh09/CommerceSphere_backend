# Recommendation Service

Product recommendation service for CommerceSphere e-commerce platform.

## Features

- **Personalized Recommendations**: Uses collaborative filtering and content-based filtering
- **Trending Products**: Calculates trending scores with time decay
- **Similar Products**: Returns products similar to a given product
- **View Tracking**: Records product views for recommendation generation
- **Event-Driven**: Consumes Kafka events for product views and purchases
- **Redis Caching**: Caches recommendations with 1-hour TTL

## Technology Stack

- **Framework**: FastAPI
- **Language**: Python 3.11+
- **Database**: PostgreSQL
- **Cache**: Redis
- **Message Broker**: Kafka
- **Libraries**: scikit-learn for similarity calculations

## Setup

### Prerequisites

- Python 3.11+
- PostgreSQL
- Redis
- Kafka

### Installation

1. Install dependencies:
```bash
pip install -r requirements.txt
```

2. Configure environment variables:
```bash
cp .env.example .env
# Edit .env with your configuration
```

3. Run the service:
```bash
python -m uvicorn src.main:app --host 0.0.0.0 --port 3008
```

Or for development with auto-reload:
```bash
python -m uvicorn src.main:app --host 0.0.0.0 --port 3008 --reload
```

## API Endpoints

### GET /api/recommendations/personalized
Get personalized recommendations for a user.

**Query Parameters:**
- `user_id` (UUID, required): User ID
- `limit` (int, optional): Number of recommendations (default: 10)

**Response:**
```json
{
  "recommendations": [
    {
      "product_id": "uuid",
      "score": 0.85,
      "reason": "collaborative_filtering"
    }
  ],
  "user_id": "uuid"
}
```

### GET /api/recommendations/trending
Get trending products.

**Query Parameters:**
- `limit` (int, optional): Number of products (default: 10)

**Response:**
```json
[
  {
    "product_id": "uuid",
    "trending_score": 42.5,
    "views": 150,
    "purchases": 25
  }
]
```

### GET /api/recommendations/similar/{product_id}
Get products similar to the specified product.

**Path Parameters:**
- `product_id` (UUID, required): Product ID

**Query Parameters:**
- `limit` (int, optional): Number of similar products (default: 10)

**Response:**
```json
[
  {
    "product_id": "uuid",
    "similarity_score": 0.92
  }
]
```

### POST /api/recommendations/track-view
Track a product view (internal endpoint).

**Request Body:**
```json
{
  "user_id": "uuid",
  "product_id": "uuid"
}
```

**Response:**
```json
{
  "message": "View tracked successfully"
}
```

## Recommendation Algorithms

### Collaborative Filtering
- **User-based**: Finds similar users based on purchase history
- **Item-based**: Recommends products purchased by similar users
- Uses co-purchase patterns to identify similarities

### Content-Based Filtering
- Recommends products similar to those the user has viewed
- Uses pre-calculated similarity scores from the `product_similarity` table
- Based on product attributes and categories

### Trending Score Calculation
- Formula: `(views * 0.3 + purchases * 0.7) * time_decay`
- Time decay: `exp(-days_since_activity / 1.0)`
- Recent activity weighted higher
- Calculated over 7-day window

## Event Consumption

The service consumes the following Kafka events:

- `product.viewed`: Records product views for recommendation generation
- `order.completed`: Records purchases to update recommendation models

## Caching Strategy

- **User Recommendations**: Cached for 1 hour per user
- **Trending Products**: Cached for 1 hour globally
- **Similar Products**: Cached for 1 hour per product
- Cache invalidated on new purchases

## Database Schema

### user_product_views
Tracks product views by users.

```sql
CREATE TABLE user_product_views (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    product_id UUID NOT NULL,
    viewed_at TIMESTAMP DEFAULT NOW()
);
```

### user_purchases
Tracks product purchases by users.

```sql
CREATE TABLE user_purchases (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    product_id UUID NOT NULL,
    purchased_at TIMESTAMP DEFAULT NOW()
);
```

### product_similarity
Stores pre-calculated product similarity scores.

```sql
CREATE TABLE product_similarity (
    product_id_1 UUID NOT NULL,
    product_id_2 UUID NOT NULL,
    similarity_score FLOAT NOT NULL,
    PRIMARY KEY (product_id_1, product_id_2)
);
```

## Health Checks

- **Health**: `GET /health` - Basic health check
- **Readiness**: `GET /ready` - Readiness check for Kubernetes

## Development

### Running Tests
```bash
pytest
```

### Code Formatting
```bash
black src/
```

### Type Checking
```bash
mypy src/
```

## Environment Variables

- `PORT`: Service port (default: 3008)
- `DATABASE_URL`: PostgreSQL connection string
- `REDIS_URL`: Redis connection string
- `KAFKA_BROKERS`: Comma-separated list of Kafka brokers
- `KAFKA_GROUP_ID`: Kafka consumer group ID
- `LOG_LEVEL`: Logging level (default: info)
