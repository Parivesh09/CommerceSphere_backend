import { createLogger } from '@commercesphere/utils';
import { elasticsearchClient, PRODUCTS_INDEX } from './elasticsearch-client';
import {
  SearchQuery,
  SearchResponse,
  SearchResult,
  AutocompleteResult,
  ProductDocument,
} from './types';
import { config } from './config';
import {
  getCachedSearchResults,
  setCachedSearchResults,
  generateCacheKey,
} from './cache';

const logger = createLogger({ serviceName: 'search-service' });

export class SearchService {
  async search(query: SearchQuery): Promise<SearchResponse> {
    try {

      const cacheKey = generateCacheKey(query as Record<string, unknown>);


      const cached = await getCachedSearchResults(cacheKey);
      if (cached) {
        return cached;
      }


      const esQuery = this.buildSearchQuery(query);
      const page = query.page || 1;
      const pageSize = Math.min(
        query.pageSize || config.search.defaultPageSize,
        config.search.maxPageSize
      );
      const from = (page - 1) * pageSize;

      logger.info('Executing search', { query, esQuery });


      const response = await elasticsearchClient.search<ProductDocument>({
        index: PRODUCTS_INDEX,
        body: esQuery as Record<string, unknown>,
        from,
        size: pageSize,
      });


      const results: SearchResult[] = response.hits.hits.map((hit) => ({
        id: (hit._source as ProductDocument).id,
        title: (hit._source as ProductDocument).title,
        description: (hit._source as ProductDocument).description,
        price: (hit._source as ProductDocument).price,
        category: (hit._source as ProductDocument).category,
        inventoryQuantity: (hit._source as ProductDocument).inventoryQuantity,
        status: (hit._source as ProductDocument).status,
        createdAt: (hit._source as ProductDocument).createdAt,
        score: hit._score ?? undefined,
      }));

      const total = typeof response.hits.total === 'number' 
        ? response.hits.total 
        : response.hits.total?.value || 0;
      
      const totalPages = Math.ceil(total / pageSize);

      const searchResponse: SearchResponse = {
        results,
        total,
        page,
        pageSize,
        totalPages,
      };


      await setCachedSearchResults(cacheKey, searchResponse);

      logger.info('Search completed', {
        total,
        resultsCount: results.length,
        page,
      });

      return searchResponse;
    } catch (error) {
      logger.error('Search failed', { error, query });
      throw error;
    }
  }

  async autocomplete(query: string): Promise<AutocompleteResult> {
    try {
      if (query.length < config.search.autocompleteMinLength) {
        return { suggestions: [] };
      }

      logger.info('Executing autocomplete', { query });


      const response = await elasticsearchClient.search<{ title: string }>({
        index: PRODUCTS_INDEX,
        body: {
          query: {
            bool: {
              must: [
                {
                  multi_match: {
                    query,
                    fields: ['title^2', 'description'],
                    type: 'bool_prefix',
                  },
                },
              ],
              filter: [{ term: { status: 'active' } }],
            },
          },
          _source: ['title'],
          size: config.search.autocompleteMaxResults,
        },
      });

      const suggestions = response.hits.hits.map(
        (hit) => (hit._source as { title: string }).title
      );

      logger.info('Autocomplete completed', {
        query,
        suggestionsCount: suggestions.length,
      });

      return { suggestions };
    } catch (error) {
      logger.error('Autocomplete failed', { error, query });
      throw error;
    }
  }

  async indexProduct(product: ProductDocument): Promise<void> {
    try {
      logger.info('Indexing product', { productId: product.id });

      await elasticsearchClient.index({
        index: PRODUCTS_INDEX,
        id: product.id,
        body: product,
        refresh: 'wait_for', // Ensure product is searchable immediately
      });

      logger.info('Product indexed successfully', { productId: product.id });
    } catch (error) {
      logger.error('Failed to index product', { error, productId: product.id });
      throw error;
    }
  }

  async deleteProduct(productId: string): Promise<void> {
    try {
      logger.info('Deleting product from index', { productId });

      await elasticsearchClient.delete({
        index: PRODUCTS_INDEX,
        id: productId,
        refresh: 'wait_for',
      });

      logger.info('Product deleted from index', { productId });
    } catch (error) {
      if ((error as { meta?: { statusCode?: number } }).meta?.statusCode === 404) {
        logger.warn('Product not found in index', { productId });
        return;
      }
      logger.error('Failed to delete product from index', {
        error,
        productId,
      });
      throw error;
    }
  }

  private buildSearchQuery(query: SearchQuery): Record<string, unknown> {
    const must: Record<string, unknown>[] = [];
    const filter: Record<string, unknown>[] = [];


    if (query.query) {
      must.push({
        multi_match: {
          query: query.query,
          fields: ['title^2', 'description'],
          fuzziness: 'AUTO', // Enables typo tolerance
          prefix_length: 2,
        },
      });
    }


    if (query.category) {
      filter.push({ term: { category: query.category } });
    }


    if (query.minPrice !== undefined || query.maxPrice !== undefined) {
      const priceRange: { gte?: number; lte?: number } = {};
      if (query.minPrice !== undefined) {
        priceRange.gte = query.minPrice;
      }
      if (query.maxPrice !== undefined) {
        priceRange.lte = query.maxPrice;
      }
      filter.push({ range: { price: priceRange } });
    }


    if (query.status) {
      filter.push({ term: { status: query.status } });
    }


    const sort = this.buildSort(query.sortBy);


    const esQuery: Record<string, unknown> = {
      query: {
        bool: {
          must: must.length > 0 ? must : [{ match_all: {} }],
          filter,
        },
      },
    };

    if (sort) {
      esQuery.sort = sort;
    }

    return esQuery;
  }

  private buildSort(sortBy?: string): Record<string, string>[] | undefined {
    switch (sortBy) {
      case 'price_asc':
        return [{ price: 'asc' }];
      case 'price_desc':
        return [{ price: 'desc' }];
      case 'created_desc':
        return [{ createdAt: 'desc' }];
      case 'relevance':
      default:

        return undefined;
    }
  }
}
