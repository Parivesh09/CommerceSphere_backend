export interface OrderMetrics {
  timestamp: Date;
  totalOrders: number;
  totalRevenue: number;
  averageOrderValue: number;
}

export interface ProductMetrics {
  timestamp: Date;
  productId: string;
  views: number;
  purchases: number;
  revenue: number;
}

export interface UserMetrics {
  userId: string;
  totalOrders: number;
  totalSpent: number;
  lifetimeValue: number;
  lastOrderAt: Date | null;
  updatedAt: Date;
}

export interface SalesAnalyticsQuery {
  startDate?: string;
  endDate?: string;
  interval?: 'hour' | 'day' | 'week' | 'month';
}

export interface TopProductsQuery {
  startDate?: string;
  endDate?: string;
  limit?: number;
  sortBy?: 'revenue' | 'purchases' | 'views';
}

export interface TopCustomersQuery {
  limit?: number;
  sortBy?: 'total_spent' | 'total_orders' | 'lifetime_value';
}

export interface DashboardSummary {
  totalRevenue: number;
  totalOrders: number;
  averageOrderValue: number;
  topProducts: Array<{
    productId: string;
    revenue: number;
    purchases: number;
    views: number;
  }>;
  topCustomers: Array<{
    userId: string;
    totalSpent: number;
    totalOrders: number;
    lifetimeValue: number;
  }>;
  recentMetrics: {
    last24Hours: {
      revenue: number;
      orders: number;
    };
    last7Days: {
      revenue: number;
      orders: number;
    };
    last30Days: {
      revenue: number;
      orders: number;
    };
  };
}
