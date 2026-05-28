import { v4 as uuidv4 } from 'uuid';

export interface TestUser {
  id?: string;
  email: string;
  password: string;
  name: string;
  role?: string;
}

export interface TestProduct {
  id?: string;
  title: string;
  description: string;
  price: number;
  categoryId?: string;
  inventoryQuantity: number;
  status?: string;
}

export interface TestOrder {
  id?: string;
  userId: string;
  items: Array<{
    productId: string;
    quantity: number;
    unitPrice: number;
  }>;
  shippingAddress: {
    street: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  totalAmount?: number;
  status?: string;
}

export class TestDataFactory {
  static createUser(overrides?: Partial<TestUser>): TestUser {
    const uniqueId = uuidv4().substring(0, 8);
    return {
      email: `test-${uniqueId}@example.com`,
      password: 'SecurePassword123!',
      name: `Test User ${uniqueId}`,
      role: 'customer',
      ...overrides
    };
  }

  static createAdminUser(overrides?: Partial<TestUser>): TestUser {
    return this.createUser({
      role: 'admin',
      ...overrides
    });
  }

  static createProduct(overrides?: Partial<TestProduct>): TestProduct {
    const uniqueId = uuidv4().substring(0, 8);
    return {
      title: `Test Product ${uniqueId}`,
      description: `This is a test product description for ${uniqueId}`,
      price: Math.floor(Math.random() * 1000) + 10,
      inventoryQuantity: Math.floor(Math.random() * 100) + 10,
      status: 'active',
      ...overrides
    };
  }

  static createOrder(userId: string, productIds: string[], overrides?: Partial<TestOrder>): TestOrder {
    return {
      userId,
      items: productIds.map(productId => ({
        productId,
        quantity: Math.floor(Math.random() * 3) + 1,
        unitPrice: Math.floor(Math.random() * 100) + 10
      })),
      shippingAddress: {
        street: '123 Test Street',
        city: 'Test City',
        state: 'TS',
        postalCode: '12345',
        country: 'US'
      },
      ...overrides
    };
  }

  static calculateOrderTotal(order: TestOrder): number {
    return order.items.reduce((total, item) => {
      return total + (item.quantity * item.unitPrice);
    }, 0);
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function waitForCondition(
  condition: () => Promise<boolean>,
  timeoutMs: number = 10000,
  intervalMs: number = 500
): Promise<boolean> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeoutMs) {
    if (await condition()) {
      return true;
    }
    await sleep(intervalMs);
  }
  
  return false;
}
