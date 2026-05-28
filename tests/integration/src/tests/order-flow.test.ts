import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { TestContainerManager } from '../setup/test-containers';
import { TestServiceManager } from '../setup/test-services';
import { ApiClient } from '../helpers/api-client';
import { TestDataFactory, waitForCondition } from '../helpers/test-data';

/**
 * Integration Test: Complete Order Flow
 * 
 * Tests the end-to-end order processing workflow:
 * 1. User registration and authentication
 * 2. Product creation (admin)
 * 3. Order creation
 * 4. Inventory reservation
 * 5. Payment processing
 * 6. Order confirmation
 * 
 * This test validates Requirements: 1.1, 1.2, 2.1, 4.1, 4.2, 4.3, 5.1, 5.2, 11.1, 11.3
 */
describe('Complete Order Flow Integration Test', () => {
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
  }, 120000); // 2 minute timeout for container startup

  afterAll(async () => {
    await serviceManager?.stopAll();
    await containerManager?.stopAll();
  }, 60000);

  test('Step 1: Register and authenticate customer user', async () => {

    testUser = TestDataFactory.createUser();


    const registerResponse = await apiClient.post('/auth/register', {
      email: testUser.email,
      password: testUser.password,
      name: testUser.name
    });

    expect(registerResponse.status).toBe(201);
    expect(registerResponse.data).toHaveProperty('id');
    expect(registerResponse.data.email).toBe(testUser.email);
    testUser.id = registerResponse.data.id;


    const loginResponse = await apiClient.post('/auth/login', {
      email: testUser.email,
      password: testUser.password
    });

    expect(loginResponse.status).toBe(200);
    expect(loginResponse.data).toHaveProperty('accessToken');
    expect(loginResponse.data).toHaveProperty('refreshToken');
    
    authToken = loginResponse.data.accessToken;
    apiClient.setAuthToken(authToken);
  });

  test('Step 2: Register and authenticate admin user', async () => {

    adminUser = TestDataFactory.createAdminUser();


    const registerResponse = await adminClient.post('/auth/register', {
      email: adminUser.email,
      password: adminUser.password,
      name: adminUser.name,
      role: 'admin'
    });

    expect(registerResponse.status).toBe(201);
    adminUser.id = registerResponse.data.id;


    const loginResponse = await adminClient.post('/auth/login', {
      email: adminUser.email,
      password: adminUser.password
    });

    expect(loginResponse.status).toBe(200);
    adminToken = loginResponse.data.accessToken;
    adminClient.setAuthToken(adminToken);
  });

  test('Step 3: Admin creates a product', async () => {
    testProduct = TestDataFactory.createProduct({
      inventoryQuantity: 50
    });

    const response = await adminClient.post('/products', testProduct);

    expect(response.status).toBe(201);
    expect(response.data).toHaveProperty('id');
    expect(response.data.title).toBe(testProduct.title);
    expect(response.data.inventoryQuantity).toBe(testProduct.inventoryQuantity);
    
    testProduct.id = response.data.id;
  });

  test('Step 4: Customer creates an order', async () => {
    const orderData = TestDataFactory.createOrder(testUser.id, [testProduct.id]);
    orderData.items[0].unitPrice = testProduct.price;
    orderData.totalAmount = TestDataFactory.calculateOrderTotal(orderData);

    const response = await apiClient.post('/orders', orderData);

    expect(response.status).toBe(201);
    expect(response.data).toHaveProperty('id');
    expect(response.data.status).toBe('CREATED');
    expect(response.data.userId).toBe(testUser.id);
    expect(response.data.items).toHaveLength(1);
    expect(response.data.items[0].productId).toBe(testProduct.id);
    
    testProduct.orderId = response.data.id;
  });

  test('Step 5: Verify inventory reservation', async () => {

    const reservationCreated = await waitForCondition(async () => {
      const productResponse = await adminClient.get(`/products/${testProduct.id}`);
      const currentInventory = productResponse.data.inventoryQuantity;
      

      return currentInventory < testProduct.inventoryQuantity;
    }, 10000);

    expect(reservationCreated).toBe(true);


    const productResponse = await adminClient.get(`/products/${testProduct.id}`);
    expect(productResponse.data.inventoryQuantity).toBeLessThan(testProduct.inventoryQuantity);
  });

  test('Step 6: Process payment successfully', async () => {
    const orderResponse = await apiClient.get(`/orders/${testProduct.orderId}`);
    const order = orderResponse.data;

    const paymentData = {
      orderId: order.id,
      amount: order.totalAmount,
      currency: 'USD',
      paymentMethod: 'card',
      cardToken: 'test_card_token'
    };

    const response = await apiClient.post('/payments', paymentData);

    expect(response.status).toBe(201);
    expect(response.data).toHaveProperty('id');
    expect(response.data.status).toBe('PENDING');
    expect(response.data.orderId).toBe(order.id);
    expect(response.data.amount).toBe(order.totalAmount);
  });

  test('Step 7: Verify order status updated to PAID', async () => {

    const orderPaid = await waitForCondition(async () => {
      const orderResponse = await apiClient.get(`/orders/${testProduct.orderId}`);
      return orderResponse.data.status === 'PAID' || orderResponse.data.paymentStatus === 'COMPLETED';
    }, 15000);

    expect(orderPaid).toBe(true);


    const orderResponse = await apiClient.get(`/orders/${testProduct.orderId}`);
    const order = orderResponse.data;
    
    expect(order.status).toMatch(/PAID|PROCESSING/);
    expect(order.paymentStatus).toBe('COMPLETED');
  });

  test('Step 8: Verify inventory permanently deducted', async () => {
    const productResponse = await adminClient.get(`/products/${testProduct.id}`);
    const finalInventory = productResponse.data.inventoryQuantity;
    

    expect(finalInventory).toBeLessThan(testProduct.inventoryQuantity);
  });

  test('Step 9: Verify notification was sent', async () => {

    const notificationSent = await waitForCondition(async () => {
      try {
        const response = await apiClient.get(`/notifications?userId=${testUser.id}`);
        return response.data.notifications && response.data.notifications.length > 0;
      } catch (error) {
        return false;
      }
    }, 10000);

    expect(notificationSent).toBe(true);


    const notificationResponse = await apiClient.get(`/notifications?userId=${testUser.id}`);
    const notifications = notificationResponse.data.notifications;
    
    expect(notifications.length).toBeGreaterThan(0);
    

    const orderNotification = notifications.find((n: any) => 
      n.type === 'ORDER_CREATED' || n.type === 'PAYMENT_SUCCESS'
    );
    expect(orderNotification).toBeDefined();
  });
});
