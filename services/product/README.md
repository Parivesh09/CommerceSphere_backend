# Product Service

The Product Service manages the product catalog, categories, variants, and inventory for the CommerceSphere e-commerce platform.

## Features

- **Category Management**: Create, read, update, and delete product categories with hierarchical support
- **Product Management**: Full CRUD operations for products with support for variants
- **Variant Management**: Handle product variants with independent inventory and pricing
- **Redis Caching**: Automatic caching of products and product lists with configurable TTL
- **Event Publishing**: Publishes product and inventory events to Kafka for other services
- **Cache Invalidation**: Automatic cache invalidation on updates

## API Endpoints

### Categories

- `POST /categories` - Create a new category
- `GET /categories` - List all categories
- `GET /categories/:id` - Get category by ID
- `PUT /categories/:id` - Update category
- `DELETE /categories/:id` - Delete category

### Products

- `POST /products` - Create a new product
- `GET /products` - List products (with pagination and filters)
- `GET /products/:id` - Get product by ID (includes images and variants)
- `PUT /products/:id` - Update product
- `DELETE /products/:id` - Delete product

### Variants

- `POST /products/:productId/variants` - Create a variant for a product
- `GET /products/:productId/variants` - List variants for a product
- `GET /variants/:id` - Get variant by ID
- `PUT /variants/:id` - Update variant
- `DELETE /variants/:id` - Delete variant

### Images

- `POST /products/:productId/images/upload-url` - Generate pre-signed URL for image upload
- `POST /products/:productId/images` - Confirm image upload and store URL
- `GET /products/:productId/images` - List all images for a product
- `PUT /images/:id/order` - Update image display order
- `DELETE /images/:id` - Delete image (from both storage and database)

## Image Management

The Product Service supports uploading and managing product images using AWS S3 or S3-compatible storage (like MinIO).

### Image Upload Flow

1. **Request Pre-signed URL**: Client requests a pre-signed URL for uploading an image
   ```bash
   POST /products/:productId/images/upload-url
   {
     "fileExtension": "jpg"
   }
   ```

2. **Upload to S3**: Client uploads the image directly to S3 using the pre-signed URL
   ```bash
   PUT <uploadUrl>
   Content-Type: image/jpeg
   <binary image data>
   ```

3. **Confirm Upload**: Client confirms the upload, and the service stores the image URL
   ```bash
   POST /products/:productId/images
   {
     "key": "products/product-id/uuid.jpg",
     "displayOrder": 0
   }
   ```

4. **CDN URLs**: Images are automatically served via CDN if configured

### Supported Image Formats

- JPEG (.jpg, .jpeg)
- PNG (.png)
- GIF (.gif)
- WebP (.webp)

### Image Ordering

Images have a `displayOrder` field that determines their display sequence. When confirming an upload:
- If `displayOrder` is not specified, the image is appended to the end
- If specified, the image is inserted at that position

### S3 Configuration

Add these environment variables:

```bash
# AWS S3 Configuration
AWS_REGION=us-east-1
S3_BUCKET=commercesphere-products
AWS_ACCESS_KEY_ID=your-access-key-id
AWS_SECRET_ACCESS_KEY=your-secret-access-key
S3_PRESIGNED_URL_EXPIRATION=900  # 15 minutes

# Optional: For MinIO or other S3-compatible services
# S3_ENDPOINT=http://localhost:9000

# Optional: CDN Configuration
# CDN_BASE_URL=https://cdn.commercesphere.com
```

### Using MinIO for Local Development

1. Start MinIO:
   ```bash
   docker run -p 9000:9000 -p 9001:9001 \
     -e MINIO_ROOT_USER=minioadmin \
     -e MINIO_ROOT_PASSWORD=minioadmin \
     minio/minio server /data --console-address ":9001"
   ```

2. Create bucket via MinIO console (http://localhost:9001)

3. Configure environment:
   ```bash
   S3_ENDPOINT=http://localhost:9000
   AWS_ACCESS_KEY_ID=minioadmin
   AWS_SECRET_ACCESS_KEY=minioadmin
   S3_BUCKET=commercesphere-products
   ```

### CDN Setup (Production)

For production, configure a CDN (CloudFront, CloudFlare, etc.) in front of your S3 bucket:

1. Set up CDN distribution pointing to S3 bucket
2. Configure `CDN_BASE_URL` environment variable
3. Images will be served via CDN URLs for better performance and lower costs


## Environment Variables

- `PORT` - Service port (default: 3002)
- `DB_HOST` - PostgreSQL host
- `DB_PORT` - PostgreSQL port
- `DB_NAME` - Database name (default: product_service)
- `DB_USER` - Database user
- `DB_PASSWORD` - Database password
- `REDIS_HOST` - Redis host
- `REDIS_PORT` - Redis port
- `KAFKA_BROKERS` - Kafka broker addresses (comma-separated)
- `AWS_REGION` - AWS region for S3 (default: us-east-1)
- `S3_BUCKET` - S3 bucket name for product images
- `AWS_ACCESS_KEY_ID` - AWS access key ID
- `AWS_SECRET_ACCESS_KEY` - AWS secret access key
- `S3_PRESIGNED_URL_EXPIRATION` - Pre-signed URL expiration in seconds (default: 900)
- `S3_ENDPOINT` - (Optional) Custom S3 endpoint for MinIO or other S3-compatible services
- `CDN_BASE_URL` - (Optional) CDN base URL for serving images


## Database Schema

The service uses the following tables:

- `categories` - Product categories with hierarchical support
- `products` - Main product catalog
- `product_variants` - Product variants with independent inventory
- `product_images` - Product images with ordering
- `inventory_reservations` - Inventory reservations for orders

## Events Published

- `product.created` - When a new product is created
- `product.updated` - When a product is updated
- `inventory.updated` - When inventory quantity changes

## Caching Strategy

- **Product Cache**: Individual products cached for 1 hour
- **List Cache**: Product lists cached for 5 minutes
- **Cache Invalidation**: Automatic invalidation on updates and deletes

## Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Build
npm run build

# Start production
npm start
```

## Testing

The Product Service can be tested using curl or any HTTP client:

```bash
# Create a category
curl -X POST http://localhost:3002/categories \
  -H "Content-Type: application/json" \
  -d '{"name": "Electronics", "slug": "electronics"}'

# Create a product
curl -X POST http://localhost:3002/products \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Laptop",
    "description": "High-performance laptop",
    "price": 999.99,
    "categoryId": "<category-id>",
    "inventoryQuantity": 10
  }'

# List products
curl http://localhost:3002/products?page=1&limit=20

# Get product by ID
curl http://localhost:3002/products/<product-id>
```
