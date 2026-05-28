import { Router, Request, Response } from 'express';
import { createLogger } from '@commercesphere/utils';
import { SearchService } from './search.service';
import { SearchQuery, ProductDocument } from './types';

const logger = createLogger({ serviceName: 'search-service' });
const router = Router();
const searchService = new SearchService();


router.get('/search', async (req: Request, res: Response) => {
  try {
    const query: SearchQuery = {
      query: req.query.query as string,
      category: req.query.category as string,
      minPrice: req.query.minPrice
        ? parseFloat(req.query.minPrice as string)
        : undefined,
      maxPrice: req.query.maxPrice
        ? parseFloat(req.query.maxPrice as string)
        : undefined,
      status: req.query.status as string,
      page: req.query.page ? parseInt(req.query.page as string, 10) : 1,
      pageSize: req.query.pageSize
        ? parseInt(req.query.pageSize as string, 10)
        : undefined,
      sortBy: req.query.sortBy as 'relevance' | 'price_asc' | 'price_desc' | 'created_desc' | undefined,
    };

    const results = await searchService.search(query);
    res.json(results);
  } catch (error) {
    logger.error('Search endpoint error', { error });
    res.status(500).json({
      error: {
        code: 'SEARCH_ERROR',
        message: 'Failed to execute search',
        timestamp: new Date().toISOString(),
        path: req.path,
      },
    });
  }
});


router.get('/search/autocomplete', async (req: Request, res: Response) => {
  try {
    const query = req.query.query as string;

    if (!query) {
      return res.status(400).json({
        error: {
          code: 'MISSING_QUERY',
          message: 'Query parameter is required',
          timestamp: new Date().toISOString(),
          path: req.path,
        },
      });
    }

    const results = await searchService.autocomplete(query);
    res.json(results);
  } catch (error) {
    logger.error('Autocomplete endpoint error', { error });
    res.status(500).json({
      error: {
        code: 'AUTOCOMPLETE_ERROR',
        message: 'Failed to get autocomplete suggestions',
        timestamp: new Date().toISOString(),
        path: req.path,
      },
    });
  }
});


router.post('/search/index', async (req: Request, res: Response) => {
  try {
    const product: ProductDocument = req.body;


    if (
      !product.id ||
      !product.title ||
      product.price === undefined ||
      !product.category ||
      !product.status
    ) {
      return res.status(400).json({
        error: {
          code: 'INVALID_PRODUCT',
          message: 'Missing required product fields',
          timestamp: new Date().toISOString(),
          path: req.path,
        },
      });
    }

    await searchService.indexProduct(product);
    res.status(201).json({ message: 'Product indexed successfully' });
  } catch (error) {
    logger.error('Index endpoint error', { error });
    res.status(500).json({
      error: {
        code: 'INDEX_ERROR',
        message: 'Failed to index product',
        timestamp: new Date().toISOString(),
        path: req.path,
      },
    });
  }
});


router.delete('/search/index/:id', async (req: Request, res: Response) => {
  try {
    const productId = req.params.id;

    if (!productId) {
      return res.status(400).json({
        error: {
          code: 'MISSING_PRODUCT_ID',
          message: 'Product ID is required',
          timestamp: new Date().toISOString(),
          path: req.path,
        },
      });
    }

    await searchService.deleteProduct(productId);
    res.json({ message: 'Product removed from index successfully' });
  } catch (error) {
    logger.error('Delete endpoint error', { error });
    res.status(500).json({
      error: {
        code: 'DELETE_ERROR',
        message: 'Failed to remove product from index',
        timestamp: new Date().toISOString(),
        path: req.path,
      },
    });
  }
});


router.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'healthy', service: 'search-service' });
});


router.get('/ready', async (req: Request, res: Response) => {
  try {

    await searchService.search({ page: 1, pageSize: 1 });
    res.json({ status: 'ready', service: 'search-service' });
  } catch (error) {
    res.status(503).json({
      status: 'not ready',
      service: 'search-service',
      error: 'Elasticsearch not available',
    });
  }
});

export default router;
