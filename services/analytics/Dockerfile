# Multi-stage build for Analytics Service

# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./
COPY shared ./shared
COPY services/analytics ./services/analytics

# Install dependencies
RUN npm ci

# Build shared packages
RUN npm run build -w @commercesphere/types
RUN npm run build -w @commercesphere/utils

# Build analytics service
RUN npm run build -w @commercesphere/analytics-service

# Stage 2: Production
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY shared/types/package.json ./shared/types/
COPY shared/utils/package.json ./shared/utils/
COPY services/analytics/package.json ./services/analytics/

# Install production dependencies only
RUN npm install --production --workspace=@commercesphere/analytics-service

# Copy built files
COPY --from=builder /app/shared/types/dist ./shared/types/dist
COPY --from=builder /app/shared/utils/dist ./shared/utils/dist
COPY --from=builder /app/services/analytics/dist ./services/analytics/dist

# Set working directory to analytics service
WORKDIR /app/services/analytics

# Expose port
EXPOSE 3008

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3008/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start the service
CMD ["node", "dist/index.js"]
