# Multi-stage build for API Gateway

# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY services/gateway/package*.json ./services/gateway/
COPY shared/types/package*.json ./shared/types/
COPY shared/utils/package*.json ./shared/utils/

# Install dependencies
RUN npm ci

# Copy source code
COPY tsconfig.json ./
COPY services/gateway/ ./services/gateway/
COPY shared/types/ ./shared/types/
COPY shared/utils/ ./shared/utils/

# Build shared packages
WORKDIR /app/shared/types
RUN npm run build

WORKDIR /app/shared/utils
RUN npm run build

# Build gateway service
WORKDIR /app/services/gateway
RUN npm run build

# Stage 2: Production
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY services/gateway/package*.json ./services/gateway/
COPY shared/types/package*.json ./shared/types/
COPY shared/utils/package*.json ./shared/utils/

# Install production dependencies only
RUN npm install --production

# Copy built files from builder
COPY --from=builder /app/services/gateway/dist ./services/gateway/dist
COPY --from=builder /app/shared/types/dist ./shared/types/dist
COPY --from=builder /app/shared/utils/dist ./shared/utils/dist

# Set working directory to gateway service
WORKDIR /app/services/gateway

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start the service
CMD ["node", "dist/index.js"]
