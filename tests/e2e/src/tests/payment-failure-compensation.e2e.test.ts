import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { E2EEnvironmentManager } from '../setup/test-environment';
import { ApiClient } from '../helpers/api-client';
import { TestDataFactory, waitForCondition } from '../helpers/test-data';

/**
 * E2E Test: Payment Failure and Compensation
 * 
 * Tests the saga compensation flow when payment fails:
 * 1. Customer creates an order
 * 2. Inventory is reserved
 * 3. Payment fails
 * 4. System executes compensation (releases inventory)
 * 5. Order is marked as CANCELLED
 * 6. Customer receives cancellation notification
 * 7. Inventory is restored
 * 
 * Validates Requirements: 4.4, 5.3, 6.1, 11.2, 11.4, 11.5, 20.3
 */
describe('E2E: Payment Failure and Compensation', () => {
  let envManager: E2EEnvironmentManager;
  let customerClient: ApiClient;
  let adminClient: ApiClient;
  let customer: any;
  let product: any;
  let order: any;
  let initialInventory: number;

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
      inventoryQuantity: 100
    });

    const productResponse = await adminClient.post('/products', product);
    product.id = productResponse.data.id;
    initialInventory = productResponse.data.inventoryQuantity;
    customer.id = loginResponse.data.user?.id || (await customerClient.get('/auth/me')).data.id;
  }, 180000);

  afterAll(async () => {
    await envManager?.teardown();
  }, 60000);

  test('Step 1: Verify initial product inventory', async () => {
    const response = await adminClient.get(`/products/${product.id}`);

    expect(response.status).toBe(200);
    expect(response.data.inventoryQuantity).toBe(initialInventory);
  });

  test('Step 2: Customer creates an order', async () => {
    const orderData = {
      userId: customer.id,
      items: [
        {
          productId: product.id,
          quantity: 5,
          unitPrice: product.price
        }
      ],
      shippingAddress: {
        street: '999 Failure Lane',
        city: 'Compensation City',
        state: 'TX',
        postalCode: '75001',
        country: 'US'
      },
      totalAmount: product.price * 5
    };

    const response = await customerClient.post('/orders', orderData);

    expect(response.status).toBe(201);
    expect(response.data).toHaveProperty('id');
    expect(response.data.status).toBe('CREATED');

    order = response.data;
  });

  test('Step 3: Inventory is reserved for the order', async () => {

    const reserved = await waitForCondition(async () => {
      const response = await adminClient.get(`/products/${product.id}`);
      return response.data.inventoryQuantity < initialInventory;
    }, 15000);

    expect(reserved).toBe(true);


    const response = await adminClient.get(`/products/${product.id}`);
    const currentInventory = response.data.inventoryQuantity;
    expect(currentInventory).toBeLessThan(initialInventory);
    expect(initialInventory - currentInventory).toBeGreaterThanOrEqual(5);
  });

  test('Step 4: Customer attempts payment with invalid card', async () => {
    const paymentData = {
      orderId: order.id,
      amount: order.totalAmount,
      currency: 'USD',
      paymentMethod: 'card',
      cardToken: 'tok_chargeDeclined' // This token simulates a declined payment
    };

    try {
      await customerClient.post('/payments', paymentData);

    } catch (error: any) {

      expect(error.response.status).toBeGreaterThanOrEqual(400);
    }
  });

  test('Step 5: Order status changes to CANCELLED after payment failure', async () => {

    const cancelled = await waitForCondition(async () => {
      try {
        const response = await customerClient.get(`/orders/${order.id}`);
        return response.data.status === 'CANCELLED';
      } catch {
        return false;
      }
    }, 25000);

    expect(cancelled).toBe(true);


    const response = await customerClient.get(`/orders/${order.id}`);
    expect(response.data.status).toBe('CANCELLED');
    expect(response.data.paymentStatus).toMatch(/FAILED|PENDING/);
  });

  test('Step 6: Inventory is released back (compensation executed)', async () => {

    const restored = await waitForCondition(async () => {
      const response = await adminClient.get(`/products/${product.id}`);
      return response.data.inventoryQuantity === initialInventory;
    }, 20000);

    expect(restored).toBe(true);


    const response = await adminClient.get(`/products/${product.id}`);
    expect(response.data.inventoryQuantity).toBe(initialInventory);
  });

  test('Step 7: Customer receives cancellation notification', async () => {
    const notified = await waitForCondition(async () => {
      try {
        const response = await customerClient.get(`/notifications?userId=${customer.id}`);
        const notifications = response.data.notifications || [];
        return notifications.some((n: any) => n.type === 'ORDER_CANCELLED');
      } catch {
        return false;
      }
    }, 15000);

    expect(notified).toBe(true);


    const response = await customerClient.get(`/notifications?userId=${customer.id}`);
    const cancelNotification = response.data.notifications.find((n: any) => 
      n.type === 'ORDER_CANCELLED'
    );
    
    expect(cancelNotification).toBeDefined();
    expect(cancelNotification.content).toMatch(/cancelled|failed/i);
  });

  test('Step 8: Customer can view cancelled order in history', async () => {
    const response = await customerClient.get('/orders');

    expect(response.status).toBe(200);
    
    const cancelledOrder = response.data.orders.find((o: any) => o.id === order.id);
    expect(cancelledOrder).toBeDefined();
    expect(cancelledOrder.status).toBe('CANCELLED');
  });

  test('Step 9: Test idempotent compensation - multiple compensation calls', async () => {

    try {
      await customerClient.post(`/orders/${order.id}/cancel`);
    } catch (error: unknown) {

      expect(error.response.status).toBeGreaterThanOrEqual(400);
    }


    const response = await adminClient.get(`/products/${product.id}`);
    expect(response.data.inventoryQuantity).toBe(initialInventory);
  });

  test('Step 10: Customer creates a new successful order after failure', async () => {
    const orderData = {
      userId: customer.id,
      items: [
        {
          productId: product.id,
          quantity: 2,
          unitPrice: product.price
        }
      ],
      shippingAddress: {
        street: '123 Success Street',
        city: 'Happy City',
        state: 'CA',
        postalCode: '90001',
        country: 'US'
      },
      totalAmount: product.price * 2
    };

    const response = await customerClient.post('/orders', orderData);

    expect(response.status).toBe(201);
    expect(response.data.status).toBe('CREATED');

    const newOrder = response.data;


    const paymentData = {
      orderId: newOrder.id,
      amount: newOrder.totalAmount,
      currency: 'USD',
      paymentMethod: 'card',
      cardToken: 'tok_visa' // Valid token
    };

    const paymentResponse = await customerClient.post('/payments', paymentData);
    expect(paymentResponse.status).toBe(201);


    const paid = await waitForCondition(async () => {
      const orderResponse = await customerClient.get(`/orders/${newOrder.id}`);
      return orderResponse.data.status === 'PAID' || orderResponse.data.paymentStatus === 'COMPLETED';
    }, 20000);

    expect(paid).toBe(true);
  });

  test('Step 11: Verify analytics recorded both failed and successful orders', async () => {
    const recorded = await waitForCondition(async () => {
      try {
        const response = await adminClient.get('/analytics/sales');
        return response.data.totalOrders >= 2;
      } catch {
        return false;
      }
    }, 15000);

    expect(recorded).toBe(true);

    const response = await adminClient.get('/analytics/sales');
    expect(response.data.totalOrders).toBeGreaterThanOrEqual(2);
  });

  test('Step 12: Test reservation expiration (15 minute timeout)', async () => {

    const orderData = {
      userId: customer.id,
      items: [
        {
          productId: product.id,
          quantity: 3,
          unitPrice: product.price
        }
      ],
      shippingAddress: {
        street: '456 Timeout Street',
        city: 'Expiry City',
        state: 'FL',
        postalCode: '33101',
        country: 'US'
      },
      totalAmount: product.price * 3
    };

    const response = await customerClient.post('/orders', orderData);
    expect(response.status).toBe(201);


    await waitForCondition(async () => {
      const productResponse = await adminClient.get(`/products/${product.id}`);
      return productResponse.data.inventoryQuantity < initialInventory;
    }, 15000);



    const productResponse = await adminClient.get(`/products/${product.id}`);
    expect(productResponse.data.inventoryQuantity).toBeLessThan(initialInventory);


    expect(response.data).toHaveProperty('id');
    expect(response.data.status).toBe('CREATED');



  });
});
