import { GenericContainer, StartedTestContainer, Wait } from 'testcontainers';
import { TestContainers } from './test-containers';

export interface TestServices {
  auth: StartedTestContainer;
  product: StartedTestContainer;
  order: StartedTestContainer;
  payment: StartedTestContainer;
  notification: StartedTestContainer;
  search: StartedTestContainer;
  analytics: StartedTestContainer;
  gateway: StartedTestContainer;
}

export class TestServiceManager {
  private services: Partial<TestServices> = {};

  async startAll(containers: TestContainers): Promise<TestServices> {
    const connections = this.getConnectionStrings(containers);

    console.log('Starting test services...');


    console.log('Starting Auth Service...');
    this.services.auth = await new GenericContainer('commercesphere/auth-service:test')
      .withEnvironment({
        DATABASE_URL: connections.postgres,
        REDIS_URL: connections.redis,
        JWT_SECRET: 'test-secret',
        JWT_EXPIRES_IN: '1h',
        REFRESH_TOKEN_EXPIRES_IN: '7d',
        PORT: '3001'
      })
      .withExposedPorts(3001)
      .withWaitStrategy(Wait.forHttp('/health', 3001))
      .start();


    console.log('Starting Product Service...');
    this.services.product = await new GenericContainer('commercesphere/product-service:test')
      .withEnvironment({
        DATABASE_URL: connections.postgres,
        REDIS_URL: connections.redis,
        KAFKA_BROKERS: connections.kafka,
        PORT: '3002'
      })
      .withExposedPorts(3002)
      .withWaitStrategy(Wait.forHttp('/health', 3002))
      .start();


    console.log('Starting Order Service...');
    this.services.order = await new GenericContainer('commercesphere/order-service:test')
      .withEnvironment({
        DATABASE_URL: connections.postgres,
        KAFKA_BROKERS: connections.kafka,
        PRODUCT_SERVICE_URL: `http://${this.services.product.getHost()}:${this.services.product.getMappedPort(3002)}`,
        PORT: '3003'
      })
      .withExposedPorts(3003)
      .withWaitStrategy(Wait.forHttp('/health', 3003))
      .start();


    console.log('Starting Payment Service...');
    this.services.payment = await new GenericContainer('commercesphere/payment-service:test')
      .withEnvironment({
        DATABASE_URL: connections.postgres,
        KAFKA_BROKERS: connections.kafka,
        STRIPE_SECRET_KEY: 'test-stripe-key',
        PORT: '3004'
      })
      .withExposedPorts(3004)
      .withWaitStrategy(Wait.forHttp('/health', 3004))
      .start();


    console.log('Starting Notification Service...');
    this.services.notification = await new GenericContainer('commercesphere/notification-service:test')
      .withEnvironment({
        DATABASE_URL: connections.postgres,
        KAFKA_BROKERS: connections.kafka,
        SENDGRID_API_KEY: 'test-sendgrid-key',
        PORT: '3005'
      })
      .withExposedPorts(3005)
      .withWaitStrategy(Wait.forHttp('/health', 3005))
      .start();


    console.log('Starting Search Service...');
    this.services.search = await new GenericContainer('commercesphere/search-service:test')
      .withEnvironment({
        ELASTICSEARCH_URL: connections.elasticsearch,
        KAFKA_BROKERS: connections.kafka,
        REDIS_URL: connections.redis,
        PORT: '3006'
      })
      .withExposedPorts(3006)
      .withWaitStrategy(Wait.forHttp('/health', 3006))
      .start();


    console.log('Starting Analytics Service...');
    this.services.analytics = await new GenericContainer('commercesphere/analytics-service:test')
      .withEnvironment({
        DATABASE_URL: connections.postgres,
        KAFKA_BROKERS: connections.kafka,
        PORT: '3007'
      })
      .withExposedPorts(3007)
      .withWaitStrategy(Wait.forHttp('/health', 3007))
      .start();


    console.log('Starting API Gateway...');
    this.services.gateway = await new GenericContainer('commercesphere/gateway:test')
      .withEnvironment({
        AUTH_SERVICE_URL: `http://${this.services.auth.getHost()}:${this.services.auth.getMappedPort(3001)}`,
        PRODUCT_SERVICE_URL: `http://${this.services.product.getHost()}:${this.services.product.getMappedPort(3002)}`,
        ORDER_SERVICE_URL: `http://${this.services.order.getHost()}:${this.services.order.getMappedPort(3003)}`,
        PAYMENT_SERVICE_URL: `http://${this.services.payment.getHost()}:${this.services.payment.getMappedPort(3004)}`,
        SEARCH_SERVICE_URL: `http://${this.services.search.getHost()}:${this.services.search.getMappedPort(3006)}`,
        ANALYTICS_SERVICE_URL: `http://${this.services.analytics.getHost()}:${this.services.analytics.getMappedPort(3007)}`,
        REDIS_URL: connections.redis,
        JWT_SECRET: 'test-secret',
        PORT: '3000'
      })
      .withExposedPorts(3000)
      .withWaitStrategy(Wait.forHttp('/health', 3000))
      .start();

    console.log('All test services started successfully');
    return this.services as TestServices;
  }

  async stopAll(): Promise<void> {
    console.log('Stopping test services...');

    const servicesToStop = [
      this.services.gateway,
      this.services.analytics,
      this.services.search,
      this.services.notification,
      this.services.payment,
      this.services.order,
      this.services.product,
      this.services.auth
    ];

    for (const service of servicesToStop) {
      if (service) {
        await service.stop();
      }
    }

    console.log('All test services stopped');
  }

  getServiceUrls() {
    if (!this.services.gateway) {
      throw new Error('Services not started');
    }

    return {
      gateway: `http://${this.services.gateway.getHost()}:${this.services.gateway.getMappedPort(3000)}`,
      auth: `http://${this.services.auth!.getHost()}:${this.services.auth!.getMappedPort(3001)}`,
      product: `http://${this.services.product!.getHost()}:${this.services.product!.getMappedPort(3002)}`,
      order: `http://${this.services.order!.getHost()}:${this.services.order!.getMappedPort(3003)}`,
      payment: `http://${this.services.payment!.getHost()}:${this.services.payment!.getMappedPort(3004)}`,
      notification: `http://${this.services.notification!.getHost()}:${this.services.notification!.getMappedPort(3005)}`,
      search: `http://${this.services.search!.getHost()}:${this.services.search!.getMappedPort(3006)}`,
      analytics: `http://${this.services.analytics!.getHost()}:${this.services.analytics!.getMappedPort(3007)}`
    };
  }

  private getConnectionStrings(containers: TestContainers) {
    return {
      postgres: `postgresql://test:test@${containers.postgres.getHost()}:${containers.postgres.getMappedPort(5432)}/commercesphere_test`,
      redis: `redis://${containers.redis.getHost()}:${containers.redis.getMappedPort(6379)}`,
      kafka: `${containers.kafka.getHost()}:${containers.kafka.getMappedPort(9093)}`,
      elasticsearch: `http://${containers.elasticsearch.getHost()}:${containers.elasticsearch.getMappedPort(9200)}`
    };
  }
}
