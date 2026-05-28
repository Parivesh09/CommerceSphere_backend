import { pool } from './database';
import { createLogger } from '@commercesphere/utils';
import {
  OrderMetrics,
  ProductMetrics,
  UserMetrics,
  SalesAnalyticsQuery,
  TopProductsQuery,
  TopCustomersQuery,
  DashboardSummary,
} from './types';

const logger = createLogger({ serviceName: 'analytics-service' });

export class AnalyticsService {
  /**
   * Update order metrics in real-time
   */
  async updateOrderMetrics(orderId: string, userId: string, totalAmount: number): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');


      const timestamp = new Date();
      timestamp.setMinutes(0, 0, 0);


      await client.query(
        `
        INSERT INTO order_metrics (timestamp, total_orders, total_revenue, average_order_value)
        VALUES ($1, 1, $2, $2)
        ON CONFLICT (timestamp)
        DO UPDATE SET
          total_orders = order_metrics.total_orders + 1,
          total_revenue = order_metrics.total_revenue + $2,
          average_order_value = (order_metrics.total_revenue + $2) / (order_metrics.total_orders + 1)
        `,
        [timestamp, totalAmount]
      );


      await client.query(
        `
        INSERT INTO user_metrics (user_id, total_orders, total_spent, lifetime_value, last_order_at, updated_at)
        VALUES ($1, 1, $2, $2, NOW(), NOW())
        ON CONFLICT (user_id)
        DO UPDATE SET
          total_orders = user_metrics.total_orders + 1,
          total_spent = user_metrics.total_spent + $2,
          lifetime_value = user_metrics.total_spent + $2,
          last_order_at = NOW(),
          updated_at = NOW()
        `,
        [userId, totalAmount]
      );

      await client.query('COMMIT');

      logger.info('Order metrics updated', { orderId, userId, totalAmount });
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Failed to update order metrics', { orderId, error });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Update product metrics (views and purchases)
   */
  async updateProductMetrics(
    productId: string,
    type: 'view' | 'purchase',
    revenue?: number
  ): Promise<void> {
    const client = await pool.connect();
    try {

      const timestamp = new Date();
      timestamp.setMinutes(0, 0, 0);

      if (type === 'view') {
        await client.query(
          `
          INSERT INTO product_metrics (timestamp, product_id, views, purchases, revenue)
          VALUES ($1, $2, 1, 0, 0)
          ON CONFLICT (timestamp, product_id)
          DO UPDATE SET views = product_metrics.views + 1
          `,
          [timestamp, productId]
        );
      } else if (type === 'purchase') {
        await client.query(
          `
          INSERT INTO product_metrics (timestamp, product_id, views, purchases, revenue)
          VALUES ($1, $2, 0, 1, $3)
          ON CONFLICT (timestamp, product_id)
          DO UPDATE SET
            purchases = product_metrics.purchases + 1,
            revenue = product_metrics.revenue + $3
          `,
          [timestamp, productId, revenue || 0]
        );
      }

      logger.info('Product metrics updated', { productId, type, revenue });
    } catch (error) {
      logger.error('Failed to update product metrics', { productId, type, error });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get sales analytics by time period
   */
  async getSalesAnalytics(query: SalesAnalyticsQuery): Promise<OrderMetrics[]> {
    const { startDate, endDate, interval = 'day' } = query;

    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();

    let timeInterval = '1 day';
    if (interval === 'hour') timeInterval = '1 hour';
    else if (interval === 'week') timeInterval = '1 week';
    else if (interval === 'month') timeInterval = '1 month';

    try {
      const result = await pool.query(
        `
        SELECT
          time_bucket($1, timestamp) AS timestamp,
          SUM(total_orders) AS total_orders,
          SUM(total_revenue) AS total_revenue,
          AVG(average_order_value) AS average_order_value
        FROM order_metrics
        WHERE timestamp >= $2 AND timestamp <= $3
        GROUP BY time_bucket($1, timestamp)
        ORDER BY timestamp DESC
        `,
        [timeInterval, start, end]
      );

      return result.rows.map((row) => ({
        timestamp: row.timestamp,
        totalOrders: parseInt(row.total_orders),
        totalRevenue: parseFloat(row.total_revenue),
        averageOrderValue: parseFloat(row.average_order_value),
      }));
    } catch (error) {
      logger.error('Failed to get sales analytics', { query, error });
      throw error;
    }
  }

  /**
   * Get top selling products
   */
  async getTopProducts(query: TopProductsQuery): Promise<ProductMetrics[]> {
    const { startDate, endDate, limit = 10, sortBy = 'revenue' } = query;

    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();

    const orderByColumn = sortBy === 'revenue' ? 'revenue' : sortBy === 'purchases' ? 'purchases' : 'views';

    try {
      const result = await pool.query(
        `
        SELECT
          product_id,
          SUM(views) AS views,
          SUM(purchases) AS purchases,
          SUM(revenue) AS revenue,
          MAX(timestamp) AS timestamp
        FROM product_metrics
        WHERE timestamp >= $1 AND timestamp <= $2
        GROUP BY product_id
        ORDER BY ${orderByColumn} DESC
        LIMIT $3
        `,
        [start, end, limit]
      );

      return result.rows.map((row) => ({
        timestamp: row.timestamp,
        productId: row.product_id,
        views: parseInt(row.views),
        purchases: parseInt(row.purchases),
        revenue: parseFloat(row.revenue),
      }));
    } catch (error) {
      logger.error('Failed to get top products', { query, error });
      throw error;
    }
  }

  /**
   * Get top customers by spend
   */
  async getTopCustomers(query: TopCustomersQuery): Promise<UserMetrics[]> {
    const { limit = 10, sortBy = 'total_spent' } = query;

    const orderByColumn =
      sortBy === 'total_spent'
        ? 'total_spent'
        : sortBy === 'total_orders'
        ? 'total_orders'
        : 'lifetime_value';

    try {
      const result = await pool.query(
        `
        SELECT
          user_id,
          total_orders,
          total_spent,
          lifetime_value,
          last_order_at,
          updated_at
        FROM user_metrics
        ORDER BY ${orderByColumn} DESC
        LIMIT $1
        `,
        [limit]
      );

      return result.rows.map((row) => ({
        userId: row.user_id,
        totalOrders: parseInt(row.total_orders),
        totalSpent: parseFloat(row.total_spent),
        lifetimeValue: parseFloat(row.lifetime_value),
        lastOrderAt: row.last_order_at,
        updatedAt: row.updated_at,
      }));
    } catch (error) {
      logger.error('Failed to get top customers', { query, error });
      throw error;
    }
  }

  /**
   * Get dashboard summary with key metrics
   */
  async getDashboardSummary(): Promise<DashboardSummary> {
    try {

      const totalsResult = await pool.query(`
        SELECT
          COALESCE(SUM(total_orders), 0) AS total_orders,
          COALESCE(SUM(total_revenue), 0) AS total_revenue,
          COALESCE(AVG(average_order_value), 0) AS average_order_value
        FROM order_metrics
      `);


      const now = new Date();
      const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      const [recent24h, recent7d, recent30d] = await Promise.all([
        pool.query(
          `
          SELECT
            COALESCE(SUM(total_orders), 0) AS orders,
            COALESCE(SUM(total_revenue), 0) AS revenue
          FROM order_metrics
          WHERE timestamp >= $1
          `,
          [last24Hours]
        ),
        pool.query(
          `
          SELECT
            COALESCE(SUM(total_orders), 0) AS orders,
            COALESCE(SUM(total_revenue), 0) AS revenue
          FROM order_metrics
          WHERE timestamp >= $1
          `,
          [last7Days]
        ),
        pool.query(
          `
          SELECT
            COALESCE(SUM(total_orders), 0) AS orders,
            COALESCE(SUM(total_revenue), 0) AS revenue
          FROM order_metrics
          WHERE timestamp >= $1
          `,
          [last30Days]
        ),
      ]);


      const topProducts = await this.getTopProducts({ limit: 5, sortBy: 'revenue' });
      const topCustomers = await this.getTopCustomers({ limit: 5, sortBy: 'total_spent' });

      return {
        totalRevenue: parseFloat(totalsResult.rows[0].total_revenue),
        totalOrders: parseInt(totalsResult.rows[0].total_orders),
        averageOrderValue: parseFloat(totalsResult.rows[0].average_order_value),
        topProducts: topProducts.map((p) => ({
          productId: p.productId,
          revenue: p.revenue,
          purchases: p.purchases,
          views: p.views,
        })),
        topCustomers: topCustomers.map((c) => ({
          userId: c.userId,
          totalSpent: c.totalSpent,
          totalOrders: c.totalOrders,
          lifetimeValue: c.lifetimeValue,
        })),
        recentMetrics: {
          last24Hours: {
            revenue: parseFloat(recent24h.rows[0].revenue),
            orders: parseInt(recent24h.rows[0].orders),
          },
          last7Days: {
            revenue: parseFloat(recent7d.rows[0].revenue),
            orders: parseInt(recent7d.rows[0].orders),
          },
          last30Days: {
            revenue: parseFloat(recent30d.rows[0].revenue),
            orders: parseInt(recent30d.rows[0].orders),
          },
        },
      };
    } catch (error) {
      logger.error('Failed to get dashboard summary', { error });
      throw error;
    }
  }

  /**
   * Run hourly batch aggregation (for historical data processing)
   */
  async runHourlyAggregation(): Promise<void> {
    logger.info('Running hourly batch aggregation');
    
    try {






      
      logger.info('Hourly batch aggregation completed');
    } catch (error) {
      logger.error('Failed to run hourly batch aggregation', { error });
      throw error;
    }
  }
}

export const analyticsService = new AnalyticsService();
