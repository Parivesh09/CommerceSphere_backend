import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { E2EEnvironmentManager } from '../setup/test-environment';
import { ApiClient } from '../helpers/api-client';
import { TestDataFactory, waitForCondition } from '../helpers/test-data';

/**
 * E2E Test: Complete Purchase Flow
 * 
 * Tests the complete purchase journey from a customer's perspective:
 * 1. User registers and logs in
 * 2. User browses products
 * 3. User adds products to cart (creates order)
 * 4. System reserves inventory
 * 5. User provides payment information
 * 6. Payment is processed
 * 7. Order is confirmed
 * 8. Inventory is permanently deducted
 * 9. User receives confirmation notification
 * 
 * Validates Requirements: 1.1, 1.2, 2.1, 2.2, 4.1, 4.2, 4.3, 5.1, 5.2, 6.1, 6.2, 11.1, 11.3, 20.1, 20.4
 */
describe('E2E: Complete Purchase Flow', () => {
  let envManager: E2EEnvironmentManager;
  let customerClient: ApiClient;
  let adminClient: ApiClient;
  let customer: any;
  let admin: any;
  let product: any;
  let order: any;

  beforeAll(async () => {
    envManager = new E2EEnvironmentManager();
    const env = await envManager.setup();
    customerClient = env.apiClient;
    adminClient = new ApiClient(env.gatewayUrl);
  }, 180000);

  afterAll(async () => {
    await envManager?.teardown();
  }, 60000);

  test('Step 1: Customer registers an account', async () => {
    customer = TestDataFactory.createUser({
      email: 'customer@example.com',
      name: 'Jane Customer'
    });

    const response = await customerClient.post('/auth/register', {
      email: customer.email,
      password: customer.password,
      name: customer.name
    });

    expect(response.status).toBe(201);
    expect(response.data).toHaveProperty('id');
    customer.id = response.data.id;
  });

  test('Step 2: Customer logs in', async () => {
    const response = await customerClient.post('/auth/login', {
      email: customer.email,
      password: customer.password
    });

    expect(response.status).toBe(200);
    expect(response.data).toHaveProperty('accessToken');
    customerClient.setAuthToken(response.data.accessToken);
  });

  test('Step 3: Admin creates a product', async () => {

    admin = TestDataFactory.createAdminUser();
    await adminClient.post('/auth/register', {
      email: admin.email,
      password: admin.password,
      name: admin.name,
      role: 'admin'
    });

    const loginResponse = await adminClient.post('/auth/login', {
      email: admin.email,
      password: admin.password
    });
    adminClient.setAuthToken(loginResponse.data.accessToken);


    product = TestDataFactory.createProduct({
      title: 'Premium Wireless Headphones',
      description: 'High-quality wireless headphones with noise cancellation',
      price: 299.99,
      inventoryQuantity: 100
    });

    const response = await adminClient.post('/products', product);

    expect(response.status).toBe(201);
    expect(response.data).toHaveProperty('id');
    product.id = response.data.id;
    product.initialInventory = response.data.inventoryQuantity;
  });

  test('Step 4: Customer browses and views product details', async () => {
    const response = await customerClient.get(`/products/${product.id}`);

    expect(response.status).toBe(200);
    expect(response.data.id).toBe(product.id);
    expect(response.data.title).toBe(product.title);
    expect(response.data.price).toBe(product.price);
    expect(response.data.inventoryQuantity).toBe(product.initialInventory);
    expect(response.data.status).toBe('active');
  });

  test('Step 5: Customer creates an order', async () => {
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
        street: '456 Customer Lane',
        city: 'Shopping City',
        state: 'CA',
        postalCode: '90210',
        country: 'US'
      },
      totalAmount: product.price * 2
    };

    const response = await customerClient.post('/orders', orderData);

    expect(response.status).toBe(201);
    expect(response.data).toHaveProperty('id');
    expect(response.data.status).toBe('CREATED');
    expect(response.data.userId).toBe(customer.id);
    expect(response.data.items).toHaveLength(1);
    expect(response.data.items[0].productId).toBe(product.id);
    expect(response.data.items[0].quantity).toBe(2);
    expect(response.data.totalAmount).toBe(product.price * 2);

    order = response.data;
  });

  test('Step 6: Inventory is reserved for the order', async () => {

    const reserved = await waitForCondition(async () => {
      const response = await adminClient.get(`/products/${product.id}`);
      return response.data.inventoryQuantity < product.initialInventory;
    }, 15000);

    expect(reserved).toBe(true);


    const response = await adminClient.get(`/products/${product.id}`);
    const reservedQuantity = product.initialInventory - response.data.inventoryQuantity;
    expect(reservedQuantity).toBeGreaterThanOrEqual(2);
  });

  test('Step 7: Customer initiates payment', async () => {
    const paymentData = {
      orderId: order.id,
      amount: order.totalAmount,
      currency: 'USD',
      paymentMethod: 'card',
      cardToken: 'tok_visa' // Test token
    };

    const response = await customerClient.post('/payments', paymentData);

    expect(response.status).toBe(201);
    expect(response.data).toHaveProperty('id');
    expect(response.data.orderId).toBe(order.id);
    expect(response.data.amount).toBe(order.totalAmount);
    expect(response.data.status).toMatch(/PENDING|COMPLETED/);

    order.paymentId = response.data.id;
  });

  test('Step 8: Payment is processed successfully', async () => {

    const processed = await waitForCondition(async () => {
      try {
        const response = await customerClient.get(`/payments/${order.paymentId}`);
        return response.data.status === 'COMPLETED';
      } catch {
        return false;
      }
    }, 20000);

    expect(processed).toBe(true);


    const response = await customerClient.get(`/payments/${order.paymentId}`);
    expect(response.data.status).toBe('COMPLETED');
  });

  test('Step 9: Order status is updated to PAID', async () => {

    const paid = await waitForCondition(async () => {
      const response = await customerClient.get(`/orders/${order.id}`);
      return response.data.status === 'PAID' || response.data.paymentStatus === 'COMPLETED';
    }, 20000);

    expect(paid).toBe(true);


    const response = await customerClient.get(`/orders/${order.id}`);
    expect(response.data.status).toMatch(/PAID|PROCESSING/);
    expect(response.data.paymentStatus).toBe('COMPLETED');
  });

  test('Step 10: Inventory is permanently deducted', async () => {
    const response = await adminClient.get(`/products/${product.id}`);
    

    const finalInventory = response.data.inventoryQuantity;
    expect(finalInventory).toBeLessThan(product.initialInventory);
    

    const deducted = product.initialInventory - finalInventory;
    expect(deducted).toBeGreaterThanOrEqual(2);
  });

  test('Step 11: Customer receives order confirmation notification', async () => {

    const notified = await waitForCondition(async () => {
      try {
        const response = await customerClient.get(`/notifications?userId=${customer.id}`);
        return response.data.notifications && response.data.notifications.length > 0;
      } catch {
        return false;
      }
    }, 15000);

    expect(notified).toBe(true);


    const response = await customerClient.get(`/notifications?userId=${customer.id}`);
    const notifications = response.data.notifications;
    
    expect(notifications.length).toBeGreaterThan(0);
    

    const orderNotifications = notifications.filter((n: any) => 
      n.type === 'ORDER_CREATED' || n.type === 'PAYMENT_SUCCESS'
    );
    expect(orderNotifications.length).toBeGreaterThan(0);
  });

  test('Step 12: Customer can view order history', async () => {
    const response = await customerClient.get('/orders');

    expect(response.status).toBe(200);
    expect(response.data).toHaveProperty('orders');
    expect(response.data.orders.length).toBeGreaterThan(0);

    const customerOrder = response.data.orders.find((o: any) => o.id === order.id);
    expect(customerOrder).toBeDefined();
    expect(customerOrder.status).toMatch(/PAID|PROCESSING/);
  });

  test('Step 13: Customer can view specific order details', async () => {
    const response = await customerClient.get(`/orders/${order.id}`);

    expect(response.status).toBe(200);
    expect(response.data.id).toBe(order.id);
    expect(response.data.userId).toBe(customer.id);
    expect(response.data.items).toHaveLength(1);
    expect(response.data.items[0].productId).toBe(product.id);
    expect(response.data.totalAmount).toBe(order.totalAmount);
    expect(response.data.shippingAddress).toBeDefined();
    expect(response.data.shippingAddress.street).toBe('456 Customer Lane');
  });

  test('Step 14: Analytics service records the purchase', async () => {

    const recorded = await waitForCondition(async () => {
      try {
        const response = await adminClient.get('/analytics/sales');
        return response.data.totalOrders > 0;
      } catch {
        return false;
      }
    }, 15000);

    expect(recorded).toBe(true);


    const response = await adminClient.get('/analytics/sales');
    expect(response.data.totalOrders).toBeGreaterThan(0);
    expect(response.data.totalRevenue).toBeGreaterThan(0);
  });
});
