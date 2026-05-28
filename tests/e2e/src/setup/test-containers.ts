import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisContainer, StartedRedisContainer } from '@testcontainers/redis';
import { KafkaContainer, StartedKafkaContainer } from '@testcontainers/kafka';
import { ElasticsearchContainer, StartedElasticsearchContainer } from '@testcontainers/elasticsearch';
import { Wait } from 'testcontainers';

export interface TestContainers {
  postgres: StartedPostgreSqlContainer;
  redis: StartedRedisContainer;
  kafka: StartedKafkaContainer;
  elasticsearch: StartedElasticsearchContainer;
}

export class TestContainerManager {
  private containers: Partial<TestContainers> = {};

  async startAll(): Promise<TestContainers> {
    console.log('Starting test containers...');


    console.log('Starting PostgreSQL...');
    this.containers.postgres = await new PostgreSqlContainer('postgres:15-alpine')
      .withDatabase('commercesphere_test')
      .withUsername('test')
      .withPassword('test')
      .withExposedPorts(5432)
      .start();


    console.log('Starting Redis...');
    this.containers.redis = await new RedisContainer('redis:7-alpine')
      .withExposedPorts(6379)
      .start();


    console.log('Starting Kafka...');
    this.containers.kafka = await new KafkaContainer('confluentinc/cp-kafka:7.5.0')
      .withExposedPorts(9093)
      .start();


    console.log('Starting Elasticsearch...');
    this.containers.elasticsearch = await new ElasticsearchContainer('elasticsearch:8.11.0')
      .withEnvironment({
        'discovery.type': 'single-node',
        'xpack.security.enabled': 'false'
      })
      .withExposedPorts(9200)
      .withWaitStrategy(Wait.forHttp('/', 9200))
      .start();

    console.log('All test containers started successfully');
    return this.containers as TestContainers;
  }

  async stopAll(): Promise<void> {
    console.log('Stopping test containers...');

    if (this.containers.elasticsearch) {
      await this.containers.elasticsearch.stop();
    }
    if (this.containers.kafka) {
      await this.containers.kafka.stop();
    }
    if (this.containers.redis) {
      await this.containers.redis.stop();
    }
    if (this.containers.postgres) {
      await this.containers.postgres.stop();
    }

    console.log('All test containers stopped');
  }

  getConnectionStrings() {
    if (!this.containers.postgres || !this.containers.redis || !this.containers.kafka || !this.containers.elasticsearch) {
      throw new Error('Containers not started');
    }

    return {
      postgres: `postgresql://test:test@${this.containers.postgres.getHost()}:${this.containers.postgres.getMappedPort(5432)}/commercesphere_test`,
      redis: `redis://${this.containers.redis.getHost()}:${this.containers.redis.getMappedPort(6379)}`,
      kafka: `${this.containers.kafka.getHost()}:${this.containers.kafka.getMappedPort(9093)}`,
      elasticsearch: `http://${this.containers.elasticsearch.getHost()}:${this.containers.elasticsearch.getMappedPort(9200)}`
    };
  }
}
