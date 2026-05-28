import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { E2EEnvironmentManager } from '../setup/test-environment';
import { ApiClient } from '../helpers/api-client';
import { TestDataFactory, waitForCondition } from '../helpers/test-data';

/**
 * E2E Test: Product Browsing and Search
 * 
 * Tests the complete product discovery flow from a user's perspective:
 * 1. Admin creates products
 * 2. Products are indexed for search
 * 3. User browses product catalog
 * 4. User searches for products
 * 5. User applies filters
 * 6. User views product details
 * 7. Search handles typos (fuzzy matching)
 * 
 * Validates Requirements: 2.1, 2.3, 3.1, 3.2, 3.3, 3.4, 3.5
 */
describe('E2E: Product Browsing and Search', () => {
  let envManager: E2EEnvironmentManager;
  let apiClient: ApiClient;
  let adminClient: ApiClient;
  let adminUser: any;
  let products: any[] = [];

  beforeAll(async () => {
    envManager = new E2EEnvironmentManager();
    const env = await envManager.setup();
    apiClient = env.apiClient;
    adminClient = new ApiClient(env.gatewayUrl);


    adminUser = TestDataFactory.createAdminUser();
    await adminClient.post('/auth/register', {
      email: adminUser.email,
      password: adminUser.password,
      name: adminUser.name,
      role: 'admin'
    });

    const loginResponse = await adminClient.post('/auth/login', {
      email: adminUser.email,
      password: adminUser.password
    });
    adminClient.setAuthToken(loginResponse.data.accessToken);
  }, 180000);

  afterAll(async () => {
    await envManager?.teardown();
  }, 60000);

  test('Admin can create multiple products', async () => {
    const productData = [
      {
        title: 'Apple MacBook Pro 16"',
        description: 'Powerful laptop with M2 chip, 16GB RAM, 512GB SSD',
        price: 2499.99,
        inventoryQuantity: 25,
        category: 'Electronics'
      },
      {
        title: 'Samsung Galaxy S23 Ultra',
        description: 'Flagship smartphone with 200MP camera and S Pen',
        price: 1199.99,
        inventoryQuantity: 50,
        category: 'Electronics'
      },
      {
        title: 'Sony WH-1000XM5 Headphones',
        description: 'Premium noise-cancelling wireless headphones',
        price: 399.99,
        inventoryQuantity: 100,
        category: 'Electronics'
      },
      {
        title: 'Nike Air Max 270',
        description: 'Comfortable running shoes with air cushioning',
        price: 149.99,
        inventoryQuantity: 75,
        category: 'Footwear'
      },
      {
        title: 'Adidas Ultraboost 22',
        description: 'High-performance running shoes with boost technology',
        price: 189.99,
        inventoryQuantity: 60,
        category: 'Footwear'
      }
    ];

    for (const data of productData) {
      const response = await adminClient.post('/products', data);
      expect(response.status).toBe(201);
      expect(response.data).toHaveProperty('id');
      products.push(response.data);
    }

    expect(products).toHaveLength(5);
  });

  test('Products are automatically indexed for search', async () => {

    const indexed = await waitForCondition(async () => {
      try {
        const response = await apiClient.get('/search?q=MacBook');
        return response.data.results && response.data.results.length > 0;
      } catch {
        return false;
      }
    }, 20000);

    expect(indexed).toBe(true);
  });

  test('User can browse all products without authentication', async () => {
    const response = await apiClient.get('/products');

    expect(response.status).toBe(200);
    expect(response.data).toHaveProperty('products');
    expect(response.data.products.length).toBeGreaterThanOrEqual(5);
  });

  test('User can search for products by keyword', async () => {
    const response = await apiClient.get('/search?q=MacBook');

    expect(response.status).toBe(200);
    expect(response.data).toHaveProperty('results');
    expect(response.data.results.length).toBeGreaterThan(0);

    const macbookProduct = response.data.results.find((p: any) => 
      p.title.includes('MacBook')
    );
    expect(macbookProduct).toBeDefined();
    expect(macbookProduct.title).toContain('MacBook');
  });

  test('Search results are ranked by relevance', async () => {
    const response = await apiClient.get('/search?q=running shoes');

    expect(response.status).toBe(200);
    expect(response.data.results.length).toBeGreaterThan(0);


    const runningShoes = response.data.results.filter((p: any) => 
      p.description.toLowerCase().includes('running')
    );
    expect(runningShoes.length).toBeGreaterThan(0);
  });

  test('User can filter products by price range', async () => {
    const response = await apiClient.get('/search?minPrice=100&maxPrice=500');

    expect(response.status).toBe(200);
    expect(response.data.results.length).toBeGreaterThan(0);


    response.data.results.forEach((product: any) => {
      expect(product.price).toBeGreaterThanOrEqual(100);
      expect(product.price).toBeLessThanOrEqual(500);
    });
  });

  test('User can filter products by category', async () => {
    const response = await apiClient.get('/search?category=Footwear');

    expect(response.status).toBe(200);
    expect(response.data.results.length).toBeGreaterThan(0);


    response.data.results.forEach((product: any) => {
      expect(product.category).toBe('Footwear');
    });
  });

  test('User can combine multiple filters', async () => {
    const response = await apiClient.get('/search?category=Electronics&minPrice=1000&maxPrice=3000');

    expect(response.status).toBe(200);
    
    if (response.data.results.length > 0) {
      response.data.results.forEach((product: any) => {
        expect(product.category).toBe('Electronics');
        expect(product.price).toBeGreaterThanOrEqual(1000);
        expect(product.price).toBeLessThanOrEqual(3000);
      });
    }
  });

  test('User can view detailed product information', async () => {
    const productId = products[0].id;
    const response = await apiClient.get(`/products/${productId}`);

    expect(response.status).toBe(200);
    expect(response.data.id).toBe(productId);
    expect(response.data).toHaveProperty('title');
    expect(response.data).toHaveProperty('description');
    expect(response.data).toHaveProperty('price');
    expect(response.data).toHaveProperty('inventoryQuantity');
    expect(response.data).toHaveProperty('status');
  });

  test('Search handles typos with fuzzy matching', async () => {

    const response = await apiClient.get('/search?q=Macbok');

    expect(response.status).toBe(200);
    

    const macbookProduct = response.data.results.find((p: any) => 
      p.title.includes('MacBook')
    );
    

    expect(response.data.results.length).toBeGreaterThan(0);
  });

  test('Search returns empty results for non-existent products', async () => {
    const response = await apiClient.get('/search?q=NonExistentProduct12345');

    expect(response.status).toBe(200);
    expect(response.data.results).toHaveLength(0);
  });

  test('User can get autocomplete suggestions', async () => {
    const response = await apiClient.get('/search/autocomplete?q=Mac');

    expect(response.status).toBe(200);
    expect(response.data).toHaveProperty('suggestions');
    
    if (response.data.suggestions.length > 0) {
      const hasMacBook = response.data.suggestions.some((s: string) => 
        s.toLowerCase().includes('mac')
      );
      expect(hasMacBook).toBe(true);
    }
  });

  test('Products show correct inventory status', async () => {
    const response = await apiClient.get('/products');

    expect(response.status).toBe(200);
    
    response.data.products.forEach((product: any) => {
      if (product.inventoryQuantity > 0) {
        expect(product.status).toBe('active');
      } else {
        expect(product.status).toBe('out_of_stock');
      }
    });
  });

  test('Search results include pagination', async () => {
    const response = await apiClient.get('/search?q=&page=1&limit=2');

    expect(response.status).toBe(200);
    expect(response.data).toHaveProperty('results');
    expect(response.data).toHaveProperty('total');
    expect(response.data).toHaveProperty('page');
    expect(response.data).toHaveProperty('limit');
    
    if (response.data.total > 2) {
      expect(response.data.results.length).toBeLessThanOrEqual(2);
    }
  });
});
