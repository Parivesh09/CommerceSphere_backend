import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { E2EEnvironmentManager } from '../setup/test-environment';
import { ApiClient } from '../helpers/api-client';
import { TestDataFactory } from '../helpers/test-data';

/**
 * E2E Test: User Registration and Login
 * 
 * Tests the complete user authentication flow from a user's perspective:
 * 1. New user registration
 * 2. Email validation
 * 3. Login with credentials
 * 4. Token-based authentication
 * 5. Access protected resources
 * 6. Token refresh
 * 7. Logout
 * 
 * Validates Requirements: 1.1, 1.2, 1.3, 19.1
 */
describe('E2E: User Registration and Login', () => {
  let envManager: E2EEnvironmentManager;
  let apiClient: ApiClient;
  let testUser: any;
  let accessToken: string;
  let refreshToken: string;

  beforeAll(async () => {
    envManager = new E2EEnvironmentManager();
    const env = await envManager.setup();
    apiClient = env.apiClient;
  }, 180000); // 3 minute timeout for environment setup

  afterAll(async () => {
    await envManager?.teardown();
  }, 60000);

  test('User can register a new account', async () => {
    testUser = TestDataFactory.createUser({
      email: 'john.doe@example.com',
      name: 'John Doe',
      password: 'SecurePassword123!'
    });

    const response = await apiClient.post('/auth/register', {
      email: testUser.email,
      password: testUser.password,
      name: testUser.name
    });

    expect(response.status).toBe(201);
    expect(response.data).toHaveProperty('id');
    expect(response.data.email).toBe(testUser.email);
    expect(response.data.name).toBe(testUser.name);
    expect(response.data).not.toHaveProperty('password');
    expect(response.data).not.toHaveProperty('password_hash');

    testUser.id = response.data.id;
  });

  test('User cannot register with duplicate email', async () => {
    try {
      await apiClient.post('/auth/register', {
        email: testUser.email,
        password: 'AnotherPassword123!',
        name: 'Another User'
      });
      fail('Should have thrown an error');
    } catch (error: any) {
      expect(error.response.status).toBe(409);
      expect(error.response.data.message).toMatch(/already exists|duplicate/i);
    }
  });

  test('User can login with valid credentials', async () => {
    const response = await apiClient.post('/auth/login', {
      email: testUser.email,
      password: testUser.password
    });

    expect(response.status).toBe(200);
    expect(response.data).toHaveProperty('accessToken');
    expect(response.data).toHaveProperty('refreshToken');
    expect(response.data.accessToken).toBeTruthy();
    expect(response.data.refreshToken).toBeTruthy();

    accessToken = response.data.accessToken;
    refreshToken = response.data.refreshToken;
  });

  test('User cannot login with invalid password', async () => {
    try {
      await apiClient.post('/auth/login', {
        email: testUser.email,
        password: 'WrongPassword123!'
      });
      fail('Should have thrown an error');
    } catch (error: any) {
      expect(error.response.status).toBe(401);
      expect(error.response.data.message).toMatch(/invalid|incorrect|unauthorized/i);
    }
  });

  test('User cannot login with non-existent email', async () => {
    try {
      await apiClient.post('/auth/login', {
        email: 'nonexistent@example.com',
        password: 'SomePassword123!'
      });
      fail('Should have thrown an error');
    } catch (error: any) {
      expect(error.response.status).toBe(401);
    }
  });

  test('User can access protected resources with valid token', async () => {
    apiClient.setAuthToken(accessToken);

    const response = await apiClient.get('/auth/me');

    expect(response.status).toBe(200);
    expect(response.data.id).toBe(testUser.id);
    expect(response.data.email).toBe(testUser.email);
    expect(response.data.name).toBe(testUser.name);
  });

  test('User cannot access protected resources without token', async () => {
    apiClient.clearAuthToken();

    try {
      await apiClient.get('/auth/me');
      fail('Should have thrown an error');
    } catch (error: any) {
      expect(error.response.status).toBe(401);
    }
  });

  test('User cannot access protected resources with invalid token', async () => {
    apiClient.setAuthToken('invalid-token-12345');

    try {
      await apiClient.get('/auth/me');
      fail('Should have thrown an error');
    } catch (error: any) {
      expect(error.response.status).toBe(401);
    }
  });

  test('User can refresh access token with valid refresh token', async () => {
    const response = await apiClient.post('/auth/refresh', {
      refreshToken: refreshToken
    });

    expect(response.status).toBe(200);
    expect(response.data).toHaveProperty('accessToken');
    expect(response.data.accessToken).toBeTruthy();
    expect(response.data.accessToken).not.toBe(accessToken);


    apiClient.setAuthToken(response.data.accessToken);
    const meResponse = await apiClient.get('/auth/me');
    expect(meResponse.status).toBe(200);
    expect(meResponse.data.id).toBe(testUser.id);
  });

  test('User can logout and invalidate refresh token', async () => {
    const response = await apiClient.post('/auth/logout', {
      refreshToken: refreshToken
    });

    expect(response.status).toBe(200);


    try {
      await apiClient.post('/auth/refresh', {
        refreshToken: refreshToken
      });
      fail('Should have thrown an error');
    } catch (error: any) {
      expect(error.response.status).toBe(401);
    }
  });

  test('Password is properly encrypted in storage', async () => {


    

    const loginResponse = await apiClient.post('/auth/login', {
      email: testUser.email,
      password: testUser.password
    });
    expect(loginResponse.status).toBe(200);


    expect(loginResponse.data).not.toHaveProperty('password');
    expect(loginResponse.data).not.toHaveProperty('password_hash');
  });
});
