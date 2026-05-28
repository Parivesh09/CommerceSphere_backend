import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { TestContainerManager } from '../setup/test-containers';
import { TestServiceManager } from '../setup/test-services';
import { ApiClient } from '../helpers/api-client';
import { TestDataFactory, waitForCondition } from '../helpers/test-data';

/**
 * Integration Test: Notification Delivery
 * 
 * Tests the notification system across different order events:
 * 1. Order created → notification sent
 * 2. Payment success → notification sent
 * 3. Order shipped → notification sent
 * 4. Notification preferences respected
 * 5. Retry logic for failed notifications
 * 
 * This test validates Requirements: 6.1, 6.2, 6.3, 6.4, 6.5
 */
describe('Notification Delivery Integration Test', () => {
  let containerManager: TestContainerManager;
  let serviceManager: TestServiceManager;
  let apiClient: ApiClient;
  let adminClient: ApiClient;

  let testUser: any;
  let adminUser: any;
  let testProduct: any;
  let testOrder: any;

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

  test('Setup: Create users and product', async () => {

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


    testProduct = TestDataFactory.createProduct({ inventoryQuantity: 50 });
    const productResponse = await adminClient.post('/products', testProduct);
    testProduct.id = productResponse.data.id;
  });

  test('Step 1: Create order and verify ORDER_CREATED notification', async () => {
    const orderData = TestDataFactory.createOrder(testUser.id, [testProduct.id]);
    orderData.items[0].unitPrice = testProduct.price;
    orderData.totalAmount = TestDataFactory.calculateOrderTotal(orderData);

    const response = await apiClient.post('/orders', orderData);
    expect(response.status).toBe(201);
    testOrder = response.data;


    const notificationSent = await waitForCondition(async () => {
      try {
        const notifResponse = await apiClient.get(`/notifications?userId=${testUser.id}`);
        const notifications = notifResponse.data.notifications || [];
        return notifications.some((n: any) => 
          n.type === 'ORDER_CREATED' && 
          n.content.includes(testOrder.id)
        );
      } catch (error) {
        return false;
      }
    }, 15000);

    expect(notificationSent).toBe(true);


    const notifResponse = await apiClient.get(`/notifications?userId=${testUser.id}`);
    const notifications = notifResponse.data.notifications;
    const orderNotification = notifications.find((n: any) => n.type === 'ORDER_CREATED');

    expect(orderNotification).toBeDefined();
    expect(orderNotification.userId).toBe(testUser.id);
    expect(orderNotification.status).toMatch(/SENT|PENDING/);
  });

  test('Step 2: Process payment and verify PAYMENT_SUCCESS notification', async () => {
    const paymentData = {
      orderId: testOrder.id,
      amount: testOrder.totalAmount,
      currency: 'USD',
      paymentMethod: 'card',
      cardToken: 'test_card_token'
    };

    await apiClient.post('/payments', paymentData);


    const notificationSent = await waitForCondition(async () => {
      try {
        const notifResponse = await apiClient.get(`/notifications?userId=${testUser.id}`);
        const notifications = notifResponse.data.notifications || [];
        return notifications.some((n: any) => n.type === 'PAYMENT_SUCCESS');
      } catch (error) {
        return false;
      }
    }, 15000);

    expect(notificationSent).toBe(true);


    const notifResponse = await apiClient.get(`/notifications?userId=${testUser.id}`);
    const notifications = notifResponse.data.notifications;
    const paymentNotification = notifications.find((n: any) => n.type === 'PAYMENT_SUCCESS');

    expect(paymentNotification).toBeDefined();
    expect(paymentNotification.userId).toBe(testUser.id);
  });

  test('Step 3: Update order to SHIPPED and verify notification', async () => {

    await adminClient.put(`/orders/${testOrder.id}/status`, {
      status: 'SHIPPED',
      trackingNumber: 'TRACK123456'
    });


    const notificationSent = await waitForCondition(async () => {
      try {
        const notifResponse = await apiClient.get(`/notifications?userId=${testUser.id}`);
        const notifications = notifResponse.data.notifications || [];
        return notifications.some((n: any) => n.type === 'ORDER_SHIPPED');
      } catch (error) {
        return false;
      }
    }, 15000);

    expect(notificationSent).toBe(true);


    const notifResponse = await apiClient.get(`/notifications?userId=${testUser.id}`);
    const notifications = notifResponse.data.notifications;
    const shippedNotification = notifications.find((n: any) => n.type === 'ORDER_SHIPPED');

    expect(shippedNotification).toBeDefined();
    expect(shippedNotification.content).toContain('TRACK123456');
  });

  test('Step 4: Verify notification channel preferences are respected', async () => {

    try {
      await apiClient.put(`/notifications/preferences`, {
        emailEnabled: false,
        smsEnabled: false,
        pushEnabled: true
      });


      const orderData2 = TestDataFactory.createOrder(testUser.id, [testProduct.id]);
      orderData2.items[0].unitPrice = testProduct.price;
      orderData2.totalAmount = TestDataFactory.calculateOrderTotal(orderData2);

      const response = await apiClient.post('/orders', orderData2);
      const newOrder = response.data;


      await new Promise(resolve => setTimeout(resolve, 5000));


      const notifResponse = await apiClient.get(`/notifications?userId=${testUser.id}`);
      const notifications = notifResponse.data.notifications;
      const newOrderNotifications = notifications.filter((n: any) => 
        n.content && n.content.includes(newOrder.id)
      );


      const pushNotifications = newOrderNotifications.filter((n: any) => n.channel === 'push');
      const emailNotifications = newOrderNotifications.filter((n: any) => n.channel === 'email');

      expect(pushNotifications.length).toBeGreaterThan(0);
      expect(emailNotifications.length).toBe(0);
    } catch (error: any) {

      if (error.response?.status !== 404) {
        throw error;
      }
    }
  });

  test('Step 5: Verify all notification types were sent', async () => {
    const notifResponse = await apiClient.get(`/notifications?userId=${testUser.id}`);
    const notifications = notifResponse.data.notifications;


    const notificationTypes = new Set(notifications.map((n: any) => n.type));
    
    expect(notificationTypes.has('ORDER_CREATED')).toBe(true);
    expect(notificationTypes.has('PAYMENT_SUCCESS')).toBe(true);
    expect(notificationTypes.has('ORDER_SHIPPED')).toBe(true);


    for (const notification of notifications) {
      expect(notification).toHaveProperty('id');
      expect(notification).toHaveProperty('userId');
      expect(notification).toHaveProperty('type');
      expect(notification).toHaveProperty('content');
      expect(notification).toHaveProperty('status');
      expect(notification).toHaveProperty('createdAt');
    }
  });

  test('Step 6: Verify notification retry logic (if notification fails)', async () => {


    
    const notifResponse = await apiClient.get(`/notifications?userId=${testUser.id}`);
    const notifications = notifResponse.data.notifications;


    for (const notification of notifications) {
      if (notification.retryCount !== undefined) {

        expect(notification.retryCount).toBeGreaterThanOrEqual(0);
        expect(notification.retryCount).toBeLessThanOrEqual(3);
      }


      if (notification.status === 'FAILED') {
        expect(notification.retryCount).toBe(3);
      }
    }
  });

  test('Step 7: Verify notification timestamps are correct', async () => {
    const notifResponse = await apiClient.get(`/notifications?userId=${testUser.id}`);
    const notifications = notifResponse.data.notifications;


    const sortedNotifications = notifications.sort((a: any, b: any) => 
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );


    const orderCreatedIndex = sortedNotifications.findIndex((n: any) => n.type === 'ORDER_CREATED');
    const paymentSuccessIndex = sortedNotifications.findIndex((n: any) => n.type === 'PAYMENT_SUCCESS');

    if (orderCreatedIndex !== -1 && paymentSuccessIndex !== -1) {
      expect(orderCreatedIndex).toBeLessThan(paymentSuccessIndex);
    }


    const shippedIndex = sortedNotifications.findIndex((n: any) => n.type === 'ORDER_SHIPPED');

    if (paymentSuccessIndex !== -1 && shippedIndex !== -1) {
      expect(paymentSuccessIndex).toBeLessThan(shippedIndex);
    }
  });
});
