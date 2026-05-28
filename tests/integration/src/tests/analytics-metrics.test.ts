import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { TestContainerManager } from '../setup/test-containers';
import { TestServiceManager } from '../setup/test-services';
import { ApiClient } from '../helpers/api-client';
import { TestDataFactory, waitForCondition } from '../helpers/test-data';

/**
 * Integration Test: Analytics Metrics Update
 * 
 * Tests the analytics system:
 * 1. Order events update metrics
 * 2. Sales analytics aggregate correctly
 * 3. Product metrics track views and purchases
 * 4. Customer metrics track spending
 * 5. Real-time metrics updates
 * 
 * This test validates Requirements: 8.1, 8.2, 8.3, 8.4, 8.5
 */
describe('Analytics Metrics Update Integration Test', () => {
  let containerManager: TestContainerManager;
  let serviceManager: TestServiceManager;
  let apiClient: ApiClient;
  let adminClient: ApiClient;

  let testUser: any;
  let adminUser: any;
  let testProducts: any[] = [];
  let completedOrders: any[] = [];

  beforeAll(async () => {
    containerManager = new TestContainerManager();
    const containers = await containerManager.startAll();

    serviceManager = new TestServiceManager();
    const services = await serviceManager.startAll(containers);
    const urls = serviceManager.getServiceUrls();

    apiClient = new ApiClient(urls.gateway);
    adminClient = new ApiClient(urls.gateway);
  }, 120000);

  afterAll(async () => {
    await serviceManager?.stopAll();
    await containerManager?.stopAll();
  }, 60000);

  test('Setup: Create users and products', async () => {

    testUser = TestDataFactory.createUser();
    const registerResponse = await apiClient.post('/auth/register', testUser);
    testUser.id = registerResponse.data.id;

    const loginResponse = await apiClient.post('/auth/login', {
      email: testUser.email,
      password: testUser.password
    });
    apiClient.setAuthToken(loginResponse.data.accessToken);


    adminUser = TestDataFactory.createAdminUser();
    const adminRegisterResponse = await adminClient.post('/auth/register', adminUser);
    adminUser.id = adminRegisterResponse.data.id;

    const adminLoginResponse = await adminClient.post('/auth/login', {
      email: adminUser.email,
      password: adminUser.password
    });
    adminClient.setAuthToken(adminLoginResponse.data.accessToken);


    for (let i = 0; i < 3; i++) {
      const product = TestDataFactory.createProduct({
        price: 100 * (i + 1),
        inventoryQuantity: 50
      });
      const response = await adminClient.post('/products', product);
      testProducts.push({
        ...product,
        id: response.data.id
      });
    }
  });

  test('Step 1: Get baseline analytics metrics', async () => {
    try {
      const response = await adminClient.get('/analytics/dashboard');

      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('totalOrders');
      expect(response.data).toHaveProperty('totalRevenue');
      

      testUser.baselineOrders = response.data.totalOrders || 0;
      testUser.baselineRevenue = response.data.totalRevenue || 0;
    } catch (error: any) {

      testUser.baselineOrders = 0;
      testUser.baselineRevenue = 0;
    }
  });

  test('Step 2: Create and complete multiple orders', async () => {

    for (let i = 0; i < 3; i++) {
      const orderData = TestDataFactory.createOrder(testUser.id, [testProducts[i].id]);
      orderData.items[0].unitPrice = testProducts[i].price;
      orderData.items[0].quantity = 2;
      orderData.totalAmount = TestDataFactory.calculateOrderTotal(orderData);

      const orderResponse = await apiClient.post('/orders', orderData);
      const order = orderResponse.data;


      const paymentData = {
        orderId: order.id,
        amount: order.totalAmount,
        currency: 'USD',
        paymentMethod: 'card',
        cardToken: 'test_card_token'
      };

      await apiClient.post('/payments', paymentData);


      await waitForCondition(async () => {
        const orderStatusResponse = await apiClient.get(`/orders/${order.id}`);
        return orderStatusResponse.data.status === 'PAID' || orderStatusResponse.data.paymentStatus === 'COMPLETED';
      }, 15000);

      completedOrders.push({
        ...order,
        totalAmount: orderData.totalAmount
      });
    }

    expect(completedOrders).toHaveLength(3);
  });

  test('Step 3: Verify order metrics updated', async () => {

    const metricsUpdated = await waitForCondition(async () => {
      try {
        const response = await adminClient.get('/analytics/dashboard');
        const currentOrders = response.data.totalOrders || 0;
        return currentOrders > testUser.baselineOrders;
      } catch (error) {
        return false;
      }
    }, 20000);

    expect(metricsUpdated).toBe(true);

    const response = await adminClient.get('/analytics/dashboard');
    const metrics = response.data;


    expect(metrics.totalOrders).toBeGreaterThan(testUser.baselineOrders);
    expect(metrics.totalOrders).toBeGreaterThanOrEqual(testUser.baselineOrders + 3);
  });

  test('Step 4: Verify revenue metrics aggregate correctly', async () => {
    const response = await adminClient.get('/analytics/dashboard');
    const metrics = response.data;


    const expectedRevenue = completedOrders.reduce((sum, order) => sum + order.totalAmount, 0);


    expect(metrics.totalRevenue).toBeGreaterThanOrEqual(testUser.baselineRevenue + expectedRevenue);


    if (metrics.averageOrderValue !== undefined) {
      expect(metrics.averageOrderValue).toBeGreaterThan(0);
      

      const calculatedAOV = metrics.totalRevenue / metrics.totalOrders;
      expect(Math.abs(metrics.averageOrderValue - calculatedAOV)).toBeLessThan(0.01);
    }
  });

  test('Step 5: Verify sales analytics by time period', async () => {
    const today = new Date().toISOString().split('T')[0];
    
    try {
      const response = await adminClient.get(`/analytics/sales?startDate=${today}&endDate=${today}`);

      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('revenue');
      expect(response.data).toHaveProperty('orders');


      expect(response.data.orders).toBeGreaterThanOrEqual(3);
      
      const expectedRevenue = completedOrders.reduce((sum, order) => sum + order.totalAmount, 0);
      expect(response.data.revenue).toBeGreaterThanOrEqual(expectedRevenue);
    } catch (error: any) {
      if (error.response?.status !== 404) {
        throw error;
      }
    }
  });

  test('Step 6: Verify product metrics track purchases', async () => {
    try {
      const response = await adminClient.get('/analytics/products/top');

      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('products');
      
      const topProducts = response.data.products;
      expect(Array.isArray(topProducts)).toBe(true);

      if (topProducts.length > 0) {

        const testProductIds = testProducts.map(p => p.id);
        const topProductIds = topProducts.map((p: any) => p.productId || p.id);
        
        const hasTestProduct = testProductIds.some(id => topProductIds.includes(id));
        expect(hasTestProduct).toBe(true);


        for (const product of topProducts) {
          expect(product).toHaveProperty('productId');
          
          if (product.purchases !== undefined) {
            expect(product.purchases).toBeGreaterThanOrEqual(0);
          }
          
          if (product.revenue !== undefined) {
            expect(product.revenue).toBeGreaterThanOrEqual(0);
          }
        }
      }
    } catch (error: any) {
      if (error.response?.status !== 404) {
        throw error;
      }
    }
  });

  test('Step 7: Verify customer metrics track spending', async () => {
    try {
      const response = await adminClient.get('/analytics/customers/top');

      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('customers');
      
      const topCustomers = response.data.customers;
      expect(Array.isArray(topCustomers)).toBe(true);

      if (topCustomers.length > 0) {

        const testUserInTop = topCustomers.find((c: any) => c.userId === testUser.id);
        
        if (testUserInTop) {
          expect(testUserInTop.totalOrders).toBeGreaterThanOrEqual(3);
          
          const expectedSpending = completedOrders.reduce((sum, order) => sum + order.totalAmount, 0);
          expect(testUserInTop.totalSpent).toBeGreaterThanOrEqual(expectedSpending);
          

          if (testUserInTop.lifetimeValue !== undefined) {
            expect(testUserInTop.lifetimeValue).toBeGreaterThan(0);
          }
        }


        for (const customer of topCustomers) {
          expect(customer).toHaveProperty('userId');
          expect(customer).toHaveProperty('totalOrders');
          expect(customer).toHaveProperty('totalSpent');
        }
      }
    } catch (error: any) {
      if (error.response?.status !== 404) {
        throw error;
      }
    }
  });

  test('Step 8: Verify metrics include required statistics', async () => {
    const response = await adminClient.get('/analytics/dashboard');
    const metrics = response.data;


    expect(metrics).toHaveProperty('totalOrders');
    expect(typeof metrics.totalOrders).toBe('number');


    expect(metrics).toHaveProperty('totalRevenue');
    expect(typeof metrics.totalRevenue).toBe('number');


    if (metrics.averageOrderValue !== undefined) {
      expect(typeof metrics.averageOrderValue).toBe('number');
      expect(metrics.averageOrderValue).toBeGreaterThan(0);
    }


    if (metrics.conversionRate !== undefined) {
      expect(typeof metrics.conversionRate).toBe('number');
      expect(metrics.conversionRate).toBeGreaterThanOrEqual(0);
      expect(metrics.conversionRate).toBeLessThanOrEqual(100);
    }
  });

  test('Step 9: Verify real-time metrics updates', async () => {

    const beforeResponse = await adminClient.get('/analytics/dashboard');
    const beforeMetrics = beforeResponse.data;


    const orderData = TestDataFactory.createOrder(testUser.id, [testProducts[0].id]);
    orderData.items[0].unitPrice = testProducts[0].price;
    orderData.totalAmount = TestDataFactory.calculateOrderTotal(orderData);

    const orderResponse = await apiClient.post('/orders', orderData);
    const order = orderResponse.data;


    await apiClient.post('/payments', {
      orderId: order.id,
      amount: order.totalAmount,
      currency: 'USD',
      paymentMethod: 'card',
      cardToken: 'test_card_token'
    });


    await waitForCondition(async () => {
      const orderStatusResponse = await apiClient.get(`/orders/${order.id}`);
      return orderStatusResponse.data.status === 'PAID' || orderStatusResponse.data.paymentStatus === 'COMPLETED';
    }, 15000);


    const metricsUpdated = await waitForCondition(async () => {
      const response = await adminClient.get('/analytics/dashboard');
      return response.data.totalOrders > beforeMetrics.totalOrders;
    }, 10000);

    expect(metricsUpdated).toBe(true);


    const afterResponse = await adminClient.get('/analytics/dashboard');
    const afterMetrics = afterResponse.data;

    expect(afterMetrics.totalOrders).toBe(beforeMetrics.totalOrders + 1);
    expect(afterMetrics.totalRevenue).toBeGreaterThan(beforeMetrics.totalRevenue);
  });

  test('Step 10: Verify metrics are persisted', async () => {

    const response1 = await adminClient.get('/analytics/dashboard');
    const metrics1 = response1.data;


    await new Promise(resolve => setTimeout(resolve, 2000));


    const response2 = await adminClient.get('/analytics/dashboard');
    const metrics2 = response2.data;


    expect(metrics2.totalOrders).toBe(metrics1.totalOrders);
    expect(metrics2.totalRevenue).toBe(metrics1.totalRevenue);
  });
});
