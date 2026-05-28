import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { E2EEnvironmentManager } from '../setup/test-environment';
import { ApiClient } from '../helpers/api-client';
import { TestDataFactory, waitForCondition } from '../helpers/test-data';

/**
 * E2E Test: Order Tracking
 * 
 * Tests the order tracking flow from a customer's perspective:
 * 1. Customer creates an order
 * 2. Customer tracks order status changes
 * 3. Order progresses through states (CREATED → PAID → PROCESSING → SHIPPED → DELIVERED)
 * 4. Customer receives notifications at each stage
 * 5. Customer views order history
 * 
 * Validates Requirements: 4.1, 4.5, 6.1, 6.2, 6.3
 */
describe('E2E: Order Tracking', () => {
  let envManager: E2EEnvironmentManager;
  let customerClient: ApiClient;
  let adminClient: ApiClient;
  let customer: any;
  let product: any;
  let order: any;

  beforeAll(async () => {
    envManager = new E2EEnvironmentManager();
    const env = await envManager.setup();
    customerClient = env.apiClient;
    adminClient = new ApiClient(env.gatewayUrl);


    customer = TestDataFactory.createUser();
    await customerClient.post('/auth/register', {
      email: customer.email,
      password: customer.password,
      name: customer.name
    });

    const loginResponse = await customerClient.post('/auth/login', {
      email: customer.email,
      password: customer.password
    });
    customerClient.setAuthToken(loginResponse.data.accessToken);


    const admin = TestDataFactory.createAdminUser();
    await adminClient.post('/auth/register', {
      email: admin.email,
      password: admin.password,
      name: admin.name,
      role: 'admin'
    });

    const adminLoginResponse = await adminClient.post('/auth/login', {
      email: admin.email,
      password: admin.password
    });
    adminClient.setAuthToken(adminLoginResponse.data.accessToken);

    product = TestDataFactory.createProduct({
      inventoryQuantity: 50
    });

    const productResponse = await adminClient.post('/products', product);
    product.id = productResponse.data.id;
    customer.id = loginResponse.data.user?.id || (await customerClient.get('/auth/me')).data.id;
  }, 180000);

  afterAll(async () => {
    await envManager?.teardown();
  }, 60000);

  test('Step 1: Customer creates an order', async () => {
    const orderData = {
      userId: customer.id,
      items: [
        {
          productId: product.id,
          quantity: 1,
          unitPrice: product.price
        }
      ],
      shippingAddress: {
        street: '789 Tracking Street',
        city: 'Order City',
        state: 'NY',
        postalCode: '10001',
        country: 'US'
      },
      totalAmount: product.price
    };

    const response = await customerClient.post('/orders', orderData);

    expect(response.status).toBe(201);
    expect(response.data).toHaveProperty('id');
    expect(response.data.status).toBe('CREATED');

    order = response.data;
  });

  test('Step 2: Customer can immediately view order details', async () => {
    const response = await customerClient.get(`/orders/${order.id}`);

    expect(response.status).toBe(200);
    expect(response.data.id).toBe(order.id);
    expect(response.data.status).toBe('CREATED');
    expect(response.data).toHaveProperty('createdAt');
    expect(response.data).toHaveProperty('items');
    expect(response.data).toHaveProperty('shippingAddress');
  });

  test('Step 3: Order appears in customer order history', async () => {
    const response = await customerClient.get('/orders');

    expect(response.status).toBe(200);
    expect(response.data).toHaveProperty('orders');
    
    const customerOrder = response.data.orders.find((o: any) => o.id === order.id);
    expect(customerOrder).toBeDefined();
    expect(customerOrder.status).toBe('CREATED');
  });

  test('Step 4: Customer receives order creation notification', async () => {
    const notified = await waitForCondition(async () => {
      try {
        const response = await customerClient.get(`/notifications?userId=${customer.id}`);
        const notifications = response.data.notifications || [];
        return notifications.some((n: any) => n.type === 'ORDER_CREATED');
      } catch {
        return false;
      }
    }, 15000);

    expect(notified).toBe(true);
  });

  test('Step 5: Process payment to move order to PAID status', async () => {
    const paymentData = {
      orderId: order.id,
      amount: order.totalAmount,
      currency: 'USD',
      paymentMethod: 'card',
      cardToken: 'tok_visa'
    };

    const response = await customerClient.post('/payments', paymentData);
    expect(response.status).toBe(201);


    const paid = await waitForCondition(async () => {
      const orderResponse = await customerClient.get(`/orders/${order.id}`);
      return orderResponse.data.status === 'PAID' || orderResponse.data.paymentStatus === 'COMPLETED';
    }, 20000);

    expect(paid).toBe(true);
  });

  test('Step 6: Customer can see updated order status (PAID)', async () => {
    const response = await customerClient.get(`/orders/${order.id}`);

    expect(response.status).toBe(200);
    expect(response.data.status).toMatch(/PAID|PROCESSING/);
    expect(response.data.paymentStatus).toBe('COMPLETED');
  });

  test('Step 7: Customer receives payment confirmation notification', async () => {
    const notified = await waitForCondition(async () => {
      try {
        const response = await customerClient.get(`/notifications?userId=${customer.id}`);
        const notifications = response.data.notifications || [];
        return notifications.some((n: any) => n.type === 'PAYMENT_SUCCESS');
      } catch {
        return false;
      }
    }, 15000);

    expect(notified).toBe(true);
  });

  test('Step 8: Admin updates order status to SHIPPED', async () => {
    const response = await adminClient.put(`/orders/${order.id}/status`, {
      status: 'SHIPPED',
      trackingNumber: 'TRACK123456789'
    });

    expect(response.status).toBe(200);
    expect(response.data.status).toBe('SHIPPED');
  });

  test('Step 9: Customer can see SHIPPED status with tracking info', async () => {

    const shipped = await waitForCondition(async () => {
      const response = await customerClient.get(`/orders/${order.id}`);
      return response.data.status === 'SHIPPED';
    }, 10000);

    expect(shipped).toBe(true);

    const response = await customerClient.get(`/orders/${order.id}`);
    expect(response.data.status).toBe('SHIPPED');
    expect(response.data.trackingNumber).toBe('TRACK123456789');
  });

  test('Step 10: Customer receives shipping notification', async () => {
    const notified = await waitForCondition(async () => {
      try {
        const response = await customerClient.get(`/notifications?userId=${customer.id}`);
        const notifications = response.data.notifications || [];
        return notifications.some((n: any) => n.type === 'ORDER_SHIPPED');
      } catch {
        return false;
      }
    }, 15000);

    expect(notified).toBe(true);


    const response = await customerClient.get(`/notifications?userId=${customer.id}`);
    const shippingNotification = response.data.notifications.find((n: any) => 
      n.type === 'ORDER_SHIPPED'
    );
    
    expect(shippingNotification).toBeDefined();
    expect(shippingNotification.content).toContain('TRACK123456789');
  });

  test('Step 11: Admin marks order as DELIVERED', async () => {
    const response = await adminClient.put(`/orders/${order.id}/status`, {
      status: 'DELIVERED'
    });

    expect(response.status).toBe(200);
    expect(response.data.status).toBe('DELIVERED');
  });

  test('Step 12: Customer can see DELIVERED status', async () => {
    const delivered = await waitForCondition(async () => {
      const response = await customerClient.get(`/orders/${order.id}`);
      return response.data.status === 'DELIVERED';
    }, 10000);

    expect(delivered).toBe(true);

    const response = await customerClient.get(`/orders/${order.id}`);
    expect(response.data.status).toBe('DELIVERED');
    expect(response.data).toHaveProperty('deliveredAt');
  });

  test('Step 13: Customer receives delivery confirmation notification', async () => {
    const notified = await waitForCondition(async () => {
      try {
        const response = await customerClient.get(`/notifications?userId=${customer.id}`);
        const notifications = response.data.notifications || [];
        return notifications.some((n: any) => n.type === 'ORDER_DELIVERED');
      } catch {
        return false;
      }
    }, 15000);

    expect(notified).toBe(true);
  });

  test('Step 14: Customer can view complete order timeline', async () => {
    const response = await customerClient.get(`/orders/${order.id}`);

    expect(response.status).toBe(200);
    expect(response.data.status).toBe('DELIVERED');
    expect(response.data).toHaveProperty('createdAt');
    expect(response.data).toHaveProperty('deliveredAt');
    

    const createdAt = new Date(response.data.createdAt);
    const deliveredAt = new Date(response.data.deliveredAt);
    expect(deliveredAt.getTime()).toBeGreaterThan(createdAt.getTime());
  });

  test('Step 15: All notifications are properly ordered by timestamp', async () => {
    const response = await customerClient.get(`/notifications?userId=${customer.id}`);
    const notifications = response.data.notifications || [];

    expect(notifications.length).toBeGreaterThanOrEqual(4);


    for (let i = 1; i < notifications.length; i++) {
      const prev = new Date(notifications[i - 1].createdAt);
      const curr = new Date(notifications[i].createdAt);
      expect(curr.getTime()).toBeGreaterThanOrEqual(prev.getTime());
    }
  });
});
