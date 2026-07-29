FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY tsconfig.json ./
COPY shared ./shared
COPY services/cart ./services/cart

RUN npm ci

RUN npm run build -w @commercesphere/types
RUN npm run build -w @commercesphere/utils

RUN npm run build -w @commercesphere/cart-service

FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
COPY shared/types/package.json ./shared/types/
COPY shared/utils/package.json ./shared/utils/
COPY services/cart/package.json ./services/cart/

RUN npm install --production --workspace=@commercesphere/cart-service

COPY --from=builder /app/shared/types/dist ./shared/types/dist
COPY --from=builder /app/shared/utils/dist ./shared/utils/dist
COPY --from=builder /app/services/cart/dist ./services/cart/dist

WORKDIR /app/services/cart

EXPOSE 3009

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3009/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

CMD ["node", "dist/index.js"]
