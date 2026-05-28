import { Client } from '@elastic/elasticsearch';
import { createLogger } from '@commercesphere/utils';
import { config } from './config';

const logger = createLogger({ serviceName: 'search-service' });

export const elasticsearchClient = new Client({
  node: config.elasticsearch.node,
  auth: config.elasticsearch.auth,
});

export const PRODUCTS_INDEX = 'products';

export async function initializeElasticsearch(): Promise<void> {
  try {

    const indexExists = await elasticsearchClient.indices.exists({
      index: PRODUCTS_INDEX,
    });

    if (!indexExists) {
      logger.info('Creating products index...');
      

      await elasticsearchClient.indices.create({
        index: PRODUCTS_INDEX,
        body: {
          mappings: {
            properties: {
              id: { type: 'keyword' },
              title: {
                type: 'text',
                analyzer: 'standard',
                fields: {
                  keyword: { type: 'keyword' },
                  suggest: {
                    type: 'completion',
                  },
                },
              },
              description: { type: 'text' },
              price: { type: 'float' },
              category: { type: 'keyword' },
              inventoryQuantity: { type: 'integer' },
              status: { type: 'keyword' },
              createdAt: { type: 'date' },
            },
          },
        },
      });

      logger.info('Products index created successfully');
    } else {
      logger.info('Products index already exists');
    }


    const health = await elasticsearchClient.cluster.health();
    logger.info('Elasticsearch connection established', { status: health.status });
  } catch (error) {
    logger.error('Failed to initialize Elasticsearch', { error });
    throw error;
  }
}
