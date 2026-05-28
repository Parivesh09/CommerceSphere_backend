import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { TestContainerManager } from '../setup/test-containers';
import { TestServiceManager } from '../setup/test-services';
import { ApiClient } from '../helpers/api-client';
import { TestDataFactory, waitForCondition } from '../helpers/test-data';

/**
 * Integration Test: Order Cancellation with Compensation
 * 
 * Tests the saga compensation workflow when an order is cancelled:
 * 1. Create order and reserve inventory
 * 2. Simulate payment failure
 * 3. Verify compensation: inventory released
 * 4. Verify order status updated to CANCELLED
 * 
 * This test validates Requirements: 4.4, 11.2, 11.4, 11.5, 20.3
 */
describe('Order Cancellation with Compensation Integration Test', () => {
  let containerManager: TestContainerManager;
  let serviceManager: TestServiceManager;
  let apiClient: ApiClient;
  let adminClient: ApiClient;

  let testUser: any;
  let adminUser: any;
  let testProduct: any;
  let authToken: string;
  let adminToken: string;

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

  test('Setup: Create and authenticate users', async () => {

    testUser = TestDataFactory.createUser();
    const registerResponse = await apiClient.post('/auth/register', testUser);
    testUser.id = registerResponse.data.id;

    const loginResponse = await apiClient.post('/auth/login', {
      email: testUser.email,
      password: testUser.password
    });
    authToken = loginResponse.data.accessToken;
    apiClient.setAuthToken(authToken);


    adminUser = TestDataFactory.createAdminUser();
    const adminRegisterResponse = await adminClient.post('/auth/register', adminUser);
    adminUser.id = adminRegisterResponse.data.id;

    const adminLoginResponse = await adminClient.post('/auth/login', {
      email: adminUser.email,
      password: adminUser.password
    });
    adminToken = adminLoginResponse.data.accessToken;
    adminClient.setAuthToken(adminToken);
  });

  test('Setup: Create product with inventory', async () => {
    testProduct = TestDataFactory.createProduct({
      inventoryQuantity: 100
    });

    const response = await adminClient.post('/products', testProduct);
    testProduct.id = response.data.id;
    testProduct.initialInventory = response.data.inventoryQuantity;
  });

  test('Step 1: Create order and verify inventory reservation', async () => {
    const orderData = TestDataFactory.createOrder(testUser.id, [testProduct.id]);
    orderData.items[0].unitPrice = testProduct.price;
    orderData.items[0].quantity = 5; // Order 5 units
    orderData.totalAmount = TestDataFactory.calculateOrderTotal(orderData);

    const response = await apiClient.post('/orders', orderData);

    expect(response.status).toBe(201);
    expect(response.data.status).toBe('CREATED');
    testProduct.orderId = response.data.id;
    testProduct.orderedQuantity = orderData.items[0].quantity;


    const reservationCreated = await waitForCondition(async () => {
      const productResponse = await adminClient.get(`/products/${testProduct.id}`);
      return productResponse.data.inventoryQuantity < testProduct.initialInventory;
    }, 10000);

    expect(reservationCreated).toBe(true);


    const productResponse = await adminClient.get(`/products/${testProduct.id}`);
    testProduct.reservedInventory = productResponse.data.inventoryQuantity;
  });

  test('Step 2: Simulate payment failure', async () => {

    const paymentData = {
      orderId: testProduct.orderId,
      amount: 999999.99, // Invalid amount to trigger failure
      currency: 'USD',
      paymentMethod: 'card',
      cardToken: 'invalid_card_token'
    };

    try {
      await apiClient.post('/payments', paymentData);
    } catch (error: any) {

      expect(error.response?.status).toBeGreaterThanOrEqual(400);
    }
  });

  test('Step 3: Verify compensation - inventory released', async () => {

    const inventoryReleased = await waitForCondition(async () => {
      const productResponse = await adminClient.get(`/products/${testProduct.id}`);
      const currentInventory = productResponse.data.inventoryQuantity;
      

      return currentInventory === testProduct.initialInventory;
    }, 15000);

    expect(inventoryReleased).toBe(true);


    const productResponse = await adminClient.get(`/products/${testProduct.id}`);
    expect(productResponse.data.inventoryQuantity).toBe(testProduct.initialInventory);
  });

  test('Step 4: Verify order status is CANCELLED', async () => {

    const orderCancelled = await waitForCondition(async () => {
      const orderResponse = await apiClient.get(`/orders/${testProduct.orderId}`);
      return orderResponse.data.status === 'CANCELLED';
    }, 15000);

    expect(orderCancelled).toBe(true);


    const orderResponse = await apiClient.get(`/orders/${testProduct.orderId}`);
    expect(orderResponse.data.status).toBe('CANCELLED');
    expect(orderResponse.data.paymentStatus).toMatch(/FAILED|PENDING/);
  });

  test('Step 5: Verify compensation idempotency', async () => {

    try {
      await apiClient.post(`/orders/${testProduct.orderId}/cancel`);
    } catch (error) {

    }


    await new Promise(resolve => setTimeout(resolve, 2000));


    const productResponse = await adminClient.get(`/products/${testProduct.id}`);
    expect(productResponse.data.inventoryQuantity).toBe(testProduct.initialInventory);


    const orderResponse = await apiClient.get(`/orders/${testProduct.orderId}`);
    expect(orderResponse.data.status).toBe('CANCELLED');
  });

  test('Step 6: Verify cancellation notification sent', async () => {
    const notificationSent = await waitForCondition(async () => {
      try {
        const response = await apiClient.get(`/notifications?userId=${testUser.id}`);
        const notifications = response.data.notifications || [];
        return notifications.some((n: any) => n.type === 'ORDER_CANCELLED');
      } catch (error) {
        return false;
      }
    }, 10000);

    expect(notificationSent).toBe(true);
  });

  test('Step 7: Verify new order can be placed with released inventory', async () => {

    const newOrderData = TestDataFactory.createOrder(testUser.id, [testProduct.id]);
    newOrderData.items[0].unitPrice = testProduct.price;
    newOrderData.items[0].quantity = 3;
    newOrderData.totalAmount = TestDataFactory.calculateOrderTotal(newOrderData);

    const response = await apiClient.post('/orders', newOrderData);

    expect(response.status).toBe(201);
    expect(response.data.status).toBe('CREATED');


    const reservationCreated = await waitForCondition(async () => {
      const productResponse = await adminClient.get(`/products/${testProduct.id}`);
      return productResponse.data.inventoryQuantity < testProduct.initialInventory;
    }, 10000);

    expect(reservationCreated).toBe(true);
  });
});
