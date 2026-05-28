import { KafkaEventConsumer, createLogger } from '@commercesphere/utils';
import { DomainEvent } from '@commercesphere/types';
import { config } from './config';
import { SearchService } from './search.service';
import { ProductDocument } from './types';
import axios from 'axios';

const logger = createLogger({ serviceName: 'search-service' });
const searchService = new SearchService();


const PRODUCT_SERVICE_URL = process.env.PRODUCT_SERVICE_URL || 'http://localhost:3002';

interface ProductCreatedPayload {
  productId: string;
  title: string;
  price: number;
  categoryId: string;
}

interface ProductUpdatedPayload {
  productId: string;
  changes: Record<string, unknown>;
}

interface ProductDeletedPayload {
  productId: string;
}

interface ProductServiceResponse {
  id: string;
  title: string;
  description: string;
  price: number;
  categoryId: string;
  inventoryQuantity: number;
  status: string;
  createdAt: string;
}

export async function startEventConsumer(): Promise<void> {
  const consumer = new KafkaEventConsumer({
    brokers: config.kafka.brokers,
    groupId: config.kafka.groupId,
    clientId: config.kafka.clientId,
    topics: ['products'],
    fromBeginning: false,
  });


  consumer.registerHandler('product.created', async (event: DomainEvent) => {
    const startTime = Date.now();
    await handleProductCreated(event.payload as ProductCreatedPayload);
    const duration = Date.now() - startTime;
    logger.info('Product indexed from created event', { 
      productId: event.aggregateId,
      durationMs: duration
    });
    
    if (duration > 5000) {
      logger.warn('Indexing exceeded 5 second threshold', {
        productId: event.aggregateId,
        durationMs: duration
      });
    }
  });

  consumer.registerHandler('product.updated', async (event: DomainEvent) => {
    const startTime = Date.now();
    await handleProductUpdated(event.payload as ProductUpdatedPayload);
    const duration = Date.now() - startTime;
    logger.info('Product indexed from updated event', { 
      productId: event.aggregateId,
      durationMs: duration
    });
    
    if (duration > 5000) {
      logger.warn('Indexing exceeded 5 second threshold', {
        productId: event.aggregateId,
        durationMs: duration
      });
    }
  });

  consumer.registerHandler('product.deleted', async (event: DomainEvent) => {
    const startTime = Date.now();
    await handleProductDeleted(event.payload as ProductDeletedPayload);
    const duration = Date.now() - startTime;
    logger.info('Product deleted from index via event', { 
      productId: event.aggregateId,
      durationMs: duration
    });
    
    if (duration > 5000) {
      logger.warn('Deletion exceeded 5 second threshold', {
        productId: event.aggregateId,
        durationMs: duration
      });
    }
  });

  await consumer.connect();

  logger.info('Event consumer started', {
    topics: ['products'],
    groupId: config.kafka.groupId
  });
}

async function fetchProductFromService(productId: string): Promise<ProductServiceResponse> {
  try {
    const response = await axios.get<ProductServiceResponse>(
      `${PRODUCT_SERVICE_URL}/products/${productId}`,
      {
        timeout: 3000, // 3 second timeout to stay within 5 second requirement
      }
    );
    return response.data;
  } catch (error) {
    logger.error('Failed to fetch product from Product Service', {
      productId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new Error(`Failed to fetch product ${productId}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function handleProductCreated(payload: ProductCreatedPayload): Promise<void> {
  const { productId } = payload;

  if (!productId) {
    logger.error('Missing product ID in created event', { payload });
    throw new Error('Missing required field: productId');
  }


  const productData = await fetchProductFromService(productId);


  const product: ProductDocument = {
    id: productData.id,
    title: productData.title,
    description: productData.description || '',
    price: productData.price,
    category: productData.categoryId,
    inventoryQuantity: productData.inventoryQuantity,
    status: productData.status,
    createdAt: productData.createdAt,
  };

  await searchService.indexProduct(product);
}

async function handleProductUpdated(payload: ProductUpdatedPayload): Promise<void> {
  const { productId } = payload;

  if (!productId) {
    logger.error('Missing product ID in updated event', { payload });
    throw new Error('Missing required field: productId');
  }


  const productData = await fetchProductFromService(productId);


  const product: ProductDocument = {
    id: productData.id,
    title: productData.title,
    description: productData.description || '',
    price: productData.price,
    category: productData.categoryId,
    inventoryQuantity: productData.inventoryQuantity,
    status: productData.status,
    createdAt: productData.createdAt,
  };


  await searchService.indexProduct(product);
}

async function handleProductDeleted(payload: ProductDeletedPayload): Promise<void> {
  const { productId } = payload;

  if (!productId) {
    logger.error('Missing product ID in deleted event', { payload });
    throw new Error('Missing required field: productId');
  }

  await searchService.deleteProduct(productId);
}
