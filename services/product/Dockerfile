# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./
COPY shared ./shared
COPY services/product ./services/product

# Install dependencies
RUN npm ci

# Build shared packages
RUN npm run build -w @commercesphere/types
RUN npm run build -w @commercesphere/utils

# Build product service
RUN npm run build -w @commercesphere/product-service

# Production stage
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY shared/types/package.json ./shared/types/
COPY shared/utils/package.json ./shared/utils/
COPY services/product/package.json ./services/product/

# Install production dependencies only
RUN npm install --production --workspace=@commercesphere/product-service

# Copy built files
COPY --from=builder /app/shared/types/dist ./shared/types/dist
COPY --from=builder /app/shared/utils/dist ./shared/utils/dist
COPY --from=builder /app/services/product/dist ./services/product/dist

# Set working directory to product service
WORKDIR /app/services/product

# Expose port
EXPOSE 3002

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3002/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start the service
CMD ["node", "dist/index.js"]
