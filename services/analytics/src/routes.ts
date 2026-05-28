import { Router, Request, Response } from 'express';
import { analyticsService } from './analytics.service';
import { createLogger } from '@commercesphere/utils';
import { SalesAnalyticsQuery, TopProductsQuery, TopCustomersQuery } from './types';

const logger = createLogger({ serviceName: 'analytics-service' });
const router = Router();

/**
 * GET /analytics/sales
 * Get sales analytics by time period
 */
router.get('/sales', async (req: Request, res: Response) => {
  try {
    const query: SalesAnalyticsQuery = {
      startDate: req.query.startDate as string,
      endDate: req.query.endDate as string,
      interval: (req.query.interval as 'hour' | 'day' | 'week' | 'month') || 'day',
    };

    const analytics = await analyticsService.getSalesAnalytics(query);

    res.json({
      success: true,
      data: analytics,
    });
  } catch (error) {
    logger.error('Failed to get sales analytics', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      success: false,
      error: {
        code: 'ANALYTICS_ERROR',
        message: 'Failed to retrieve sales analytics',
      },
    });
  }
});

/**
 * GET /analytics/products/top
 * Get top selling products
 */
router.get('/products/top', async (req: Request, res: Response) => {
  try {
    const query: TopProductsQuery = {
      startDate: req.query.startDate as string,
      endDate: req.query.endDate as string,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 10,
      sortBy: (req.query.sortBy as 'revenue' | 'purchases' | 'views') || 'revenue',
    };

    const topProducts = await analyticsService.getTopProducts(query);

    res.json({
      success: true,
      data: topProducts,
    });
  } catch (error) {
    logger.error('Failed to get top products', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      success: false,
      error: {
        code: 'ANALYTICS_ERROR',
        message: 'Failed to retrieve top products',
      },
    });
  }
});

/**
 * GET /analytics/customers/top
 * Get top customers by spend
 */
router.get('/customers/top', async (req: Request, res: Response) => {
  try {
    const query: TopCustomersQuery = {
      limit: req.query.limit ? parseInt(req.query.limit as string) : 10,
      sortBy:
        (req.query.sortBy as 'total_spent' | 'total_orders' | 'lifetime_value') || 'total_spent',
    };

    const topCustomers = await analyticsService.getTopCustomers(query);

    res.json({
      success: true,
      data: topCustomers,
    });
  } catch (error) {
    logger.error('Failed to get top customers', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      success: false,
      error: {
        code: 'ANALYTICS_ERROR',
        message: 'Failed to retrieve top customers',
      },
    });
  }
});

/**
 * GET /analytics/dashboard
 * Get dashboard summary with key metrics
 */
router.get('/dashboard', async (req: Request, res: Response) => {
  try {
    const dashboard = await analyticsService.getDashboardSummary();

    res.json({
      success: true,
      data: dashboard,
    });
  } catch (error) {
    logger.error('Failed to get dashboard summary', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      success: false,
      error: {
        code: 'ANALYTICS_ERROR',
        message: 'Failed to retrieve dashboard summary',
      },
    });
  }
});

/**
 * GET /health
 * Health check endpoint
 */
router.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'healthy', service: 'analytics-service' });
});

/**
 * GET /ready
 * Readiness check endpoint
 */
router.get('/ready', (req: Request, res: Response) => {
  res.json({ status: 'ready', service: 'analytics-service' });
});

export default router;
