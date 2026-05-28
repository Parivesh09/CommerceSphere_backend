# Search Service

The Search Service provides full-text search capabilities for the CommerceSphere e-commerce platform using Elasticsearch. It enables customers to search for products with advanced filtering, fuzzy matching for typo tolerance, and autocomplete suggestions.

## Features

- **Full-text search** with relevance ranking
- **Faceted filtering** by category, price range, and status
- **Fuzzy matching** for typo tolerance
- **Autocomplete** suggestions
- **Search result caching** (5-minute TTL)
- **Event-driven indexing** via Kafka
- **Real-time index updates**

## Technology Stack

- **Runtime:** Node.js with TypeScript
- **Framework:** Express.js
- **Search Engine:** Elasticsearch 8+
- **Cache:** Redis
- **Message Broker:** Kafka

## API Endpoints

### Public Endpoints

#### Search Products
```
GET /search
```

Query Parameters:
- `query` (string, optional): Search query text
- `category` (string, optional): Filter by category
- `minPrice` (number, optional): Minimum price filter
- `maxPrice` (number, optional): Maximum price filter
- `status` (string, optional): Filter by status (active, inactive, out_of_stock)
- `page` (number, optional): Page number (default: 1)
- `pageSize` (number, optional): Results per page (default: 20, max: 100)
- `sortBy` (string, optional): Sort order (relevance, price_asc, price_desc, created_desc)

Response:
```json
{
  "results": [
    {
      "id": "product-123",
      "title": "Laptop Computer",
      "description": "High-performance laptop",
      "price": 999.99,
      "category": "electronics",
      "inventoryQuantity": 50,
      "status": "active",
      "createdAt": "2024-01-15T10:00:00Z",
      "score": 1.5
    }
  ],
  "total": 100,
  "page": 1,
  "pageSize": 20,
  "totalPages": 5
}
```

#### Autocomplete
```
GET /search/autocomplete?query=lap
```

Response:
```json
{
  "suggestions": [
    "Laptop Computer",
    "Laptop Stand",
    "Laptop Bag"
  ]
}
```

### Internal Endpoints

#### Index Product
```
POST /search/index
```

Request Body:
```json
{
  "id": "product-123",
  "title": "Laptop Computer",
  "description": "High-performance laptop",
  "price": 999.99,
  "category": "electronics",
  "inventoryQuantity": 50,
  "status": "active",
  "createdAt": "2024-01-15T10:00:00Z"
}
```

#### Delete Product from Index
```
DELETE /search/index/:id
```

### Health Endpoints

```
GET /health      # Basic health check
GET /ready       # Readiness check (includes Elasticsearch connectivity)
```

## Event Consumption

The service consumes the following Kafka events from the `products` topic:

- `product.created` - Indexes new products
- `product.updated` - Updates product index
- `product.deleted` - Removes products from index

### Event Processing Flow

1. **Product Created/Updated Events**: 
   - Receives event with minimal product data (productId, title, price, categoryId)
   - Fetches complete product data from Product Service via HTTP
   - Indexes/updates the product in Elasticsearch
   - Tracks processing time to ensure completion within 5 seconds
   - Logs warning if indexing exceeds 5-second threshold

2. **Product Deleted Events**:
   - Receives event with productId
   - Removes product from Elasticsearch index
   - Tracks processing time

### Performance Monitoring

The event consumer tracks the duration of each indexing operation and logs a warning if it exceeds the 5-second requirement specified in Requirement 3.4. This ensures compliance with the real-time indexing SLA.

## Search Features

### Full-Text Search
- Searches across product title and description
- Title matches weighted 2x higher than description
- Relevance-based ranking by default

### Fuzzy Matching
- Automatic typo tolerance using Elasticsearch's `fuzziness: AUTO`
- Handles character substitutions, insertions, and deletions
- Minimum prefix length of 2 characters for performance

### Filtering
- **Category**: Exact match filter
- **Price Range**: Min/max price filtering
- **Status**: Filter by product status

### Sorting Options
- `relevance` (default): Sort by search relevance score
- `price_asc`: Sort by price ascending
- `price_desc`: Sort by price descending
- `created_desc`: Sort by creation date descending

### Caching
- Search results cached in Redis for 5 minutes
- Cache key generated from query parameters
- Automatic cache invalidation on TTL expiry

## Configuration

Environment variables (see `.env.example`):

- `PORT`: HTTP server port (default: 3006)
- `PRODUCT_SERVICE_URL`: Product Service URL for fetching full product data (default: http://localhost:3002)
- `ELASTICSEARCH_URL`: Elasticsearch connection URL
- `ELASTICSEARCH_USERNAME`: Elasticsearch username
- `ELASTICSEARCH_PASSWORD`: Elasticsearch password
- `REDIS_HOST`: Redis host
- `REDIS_PORT`: Redis port
- `KAFKA_BROKERS`: Comma-separated Kafka broker addresses

## Development

### Install Dependencies
```bash
npm install
```

### Run in Development Mode
```bash
npm run dev
```

### Build
```bash
npm run build
```

### Run Production Build
```bash
npm start
```

## Elasticsearch Index Mapping

The service creates a `products` index with the following mapping:

```json
{
  "mappings": {
    "properties": {
      "id": { "type": "keyword" },
      "title": {
        "type": "text",
        "analyzer": "standard",
        "fields": {
          "keyword": { "type": "keyword" },
          "suggest": { "type": "completion" }
        }
      },
      "description": { "type": "text" },
      "price": { "type": "float" },
      "category": { "type": "keyword" },
      "inventoryQuantity": { "type": "integer" },
      "status": { "type": "keyword" },
      "createdAt": { "type": "date" }
    }
  }
}
```

## Performance Considerations

- Search results are cached for 5 minutes to reduce Elasticsearch load
- Autocomplete limited to 10 suggestions
- Maximum page size capped at 100 results
- Index refresh set to `wait_for` for immediate searchability

## Error Handling

All errors return a consistent format:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "timestamp": "2024-01-15T10:00:00Z",
    "path": "/search"
  }
}
```

## Requirements Validation

This implementation satisfies the following requirements:

- **3.1**: Full-text search with relevance ranking
- **3.2**: Faceted filtering (category, price range, status)
- **3.3**: Autocomplete within 200ms
- **3.4**: Product indexing within 5 seconds via events
- **3.5**: Fuzzy matching for typo tolerance
- **12.4**: Search result caching with 5-minute TTL
