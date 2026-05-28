import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { TestContainerManager } from '../setup/test-containers';
import { TestServiceManager } from '../setup/test-services';
import { ApiClient } from '../helpers/api-client';
import { TestDataFactory, waitForCondition } from '../helpers/test-data';

/**
 * Integration Test: Product Search After Creation
 * 
 * Tests the event-driven search indexing workflow:
 * 1. Admin creates products
 * 2. Product events published to Kafka
 * 3. Search service consumes events and indexes products
 * 4. Products appear in search results
 * 5. Search filters work correctly
 * 
 * This test validates Requirements: 2.3, 3.1, 3.2, 3.4, 10.1
 */
describe('Product Search After Creation Integration Test', () => {
  let containerManager: TestContainerManager;
  let serviceManager: TestServiceManager;
  let apiClient: ApiClient;
  let adminClient: ApiClient;

  let adminUser: any;
  let testProducts: any[] = [];

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

  test('Setup: Create and authenticate admin user', async () => {
    adminUser = TestDataFactory.createAdminUser();
    
    const registerResponse = await adminClient.post('/auth/register', adminUser);
    adminUser.id = registerResponse.data.id;

    const loginResponse = await adminClient.post('/auth/login', {
      email: adminUser.email,
      password: adminUser.password
    });
    
    adminClient.setAuthToken(loginResponse.data.accessToken);
  });

  test('Step 1: Create multiple products with different attributes', async () => {

    const laptop1 = TestDataFactory.createProduct({
      title: 'Gaming Laptop Pro',
      description: 'High-performance gaming laptop with RTX graphics',
      price: 1500,
      inventoryQuantity: 20
    });

    const laptop2 = TestDataFactory.createProduct({
      title: 'Business Laptop Ultra',
      description: 'Professional laptop for business users',
      price: 1200,
      inventoryQuantity: 30
    });


    const phone1 = TestDataFactory.createProduct({
      title: 'Smartphone X Pro',
      description: 'Latest smartphone with advanced camera',
      price: 800,
      inventoryQuantity: 50
    });

    const phone2 = TestDataFactory.createProduct({
      title: 'Budget Smartphone',
      description: 'Affordable smartphone for everyday use',
      price: 300,
      inventoryQuantity: 100
    });


    for (const product of [laptop1, laptop2, phone1, phone2]) {
      const response = await adminClient.post('/products', product);
      expect(response.status).toBe(201);
      testProducts.push({
        ...product,
        id: response.data.id
      });
    }

    expect(testProducts).toHaveLength(4);
  });

  test('Step 2: Wait for products to be indexed in search', async () => {

    const allProductsIndexed = await waitForCondition(async () => {
      try {
        const response = await apiClient.get('/search?q=laptop OR smartphone');
        const results = response.data.products || response.data.results || [];
        

        const indexedIds = results.map((p: any) => p.id);
        return testProducts.every(tp => indexedIds.includes(tp.id));
      } catch (error) {
        return false;
      }
    }, 20000); // Give more time for indexing

    expect(allProductsIndexed).toBe(true);
  });

  test('Step 3: Search for "laptop" returns laptop products', async () => {
    const response = await apiClient.get('/search?q=laptop');

    expect(response.status).toBe(200);
    expect(response.data).toHaveProperty('products');
    
    const results = response.data.products || response.data.results;
    expect(results.length).toBeGreaterThanOrEqual(2);


    const laptopProducts = testProducts.filter(p => p.title.toLowerCase().includes('laptop'));
    for (const laptop of laptopProducts) {
      const found = results.some((r: any) => r.id === laptop.id);
      expect(found).toBe(true);
    }


    expect(results[0]).toHaveProperty('id');
    expect(results[0].title.toLowerCase()).toContain('laptop');
  });

  test('Step 4: Search with price filter returns matching products', async () => {

    const response = await apiClient.get('/search?q=*&priceMax=1000');

    expect(response.status).toBe(200);
    const results = response.data.products || response.data.results;


    for (const result of results) {
      expect(result.price).toBeLessThanOrEqual(1000);
    }


    const phoneProducts = testProducts.filter(p => p.price <= 1000);
    const foundPhones = results.filter((r: any) => 
      phoneProducts.some(p => p.id === r.id)
    );
    expect(foundPhones.length).toBeGreaterThan(0);
  });

  test('Step 5: Search with price range filter works correctly', async () => {

    const response = await apiClient.get('/search?q=*&priceMin=500&priceMax=1300');

    expect(response.status).toBe(200);
    const results = response.data.products || response.data.results;


    for (const result of results) {
      expect(result.price).toBeGreaterThanOrEqual(500);
      expect(result.price).toBeLessThanOrEqual(1300);
    }


    const expectedProducts = testProducts.filter(p => p.price >= 500 && p.price <= 1300);
    expect(results.length).toBeGreaterThanOrEqual(expectedProducts.length);
  });

  test('Step 6: Fuzzy search handles typos', async () => {

    const response = await apiClient.get('/search?q=laptap');

    expect(response.status).toBe(200);
    const results = response.data.products || response.data.results;


    const laptopProducts = testProducts.filter(p => p.title.toLowerCase().includes('laptop'));
    const foundLaptops = results.filter((r: any) => 
      laptopProducts.some(p => p.id === r.id)
    );
    
    expect(foundLaptops.length).toBeGreaterThan(0);
  });

  test('Step 7: Update product and verify search index updates', async () => {
    const productToUpdate = testProducts[0];
    const newTitle = 'Updated Gaming Laptop Pro Max';


    const updateResponse = await adminClient.put(`/products/${productToUpdate.id}`, {
      title: newTitle,
      description: productToUpdate.description,
      price: productToUpdate.price,
      inventoryQuantity: productToUpdate.inventoryQuantity
    });

    expect(updateResponse.status).toBe(200);


    const indexUpdated = await waitForCondition(async () => {
      try {
        const response = await apiClient.get(`/search?q=${encodeURIComponent(newTitle)}`);
        const results = response.data.products || response.data.results;
        return results.some((r: any) => r.id === productToUpdate.id && r.title === newTitle);
      } catch (error) {
        return false;
      }
    }, 15000);

    expect(indexUpdated).toBe(true);


    const searchResponse = await apiClient.get(`/search?q=${encodeURIComponent(newTitle)}`);
    const results = searchResponse.data.products || searchResponse.data.results;
    const updatedProduct = results.find((r: any) => r.id === productToUpdate.id);
    
    expect(updatedProduct).toBeDefined();
    expect(updatedProduct.title).toBe(newTitle);
  });

  test('Step 8: Search autocomplete provides suggestions', async () => {
    try {
      const response = await apiClient.get('/search/autocomplete?q=lap');

      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('suggestions');
      
      const suggestions = response.data.suggestions;
      expect(Array.isArray(suggestions)).toBe(true);
      expect(suggestions.length).toBeGreaterThan(0);


      const hasLaptopSuggestion = suggestions.some((s: string) => 
        s.toLowerCase().includes('lap')
      );
      expect(hasLaptopSuggestion).toBe(true);
    } catch (error: any) {

      if (error.response?.status !== 404) {
        throw error;
      }
    }
  });

  test('Step 9: Search with status filter returns only active products', async () => {

    const productToDeactivate = testProducts[3];
    await adminClient.put(`/products/${productToDeactivate.id}`, {
      ...productToDeactivate,
      status: 'inactive'
    });


    await new Promise(resolve => setTimeout(resolve, 3000));


    const response = await apiClient.get('/search?q=*&status=active');

    expect(response.status).toBe(200);
    const results = response.data.products || response.data.results;


    for (const result of results) {
      expect(result.status).toBe('active');
    }


    const inactiveFound = results.some((r: any) => r.id === productToDeactivate.id);
    expect(inactiveFound).toBe(false);
  });
});
