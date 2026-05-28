export const config = {
  port: parseInt(process.env.PORT || '3006', 10),
  elasticsearch: {
    node: process.env.ELASTICSEARCH_URL || 'http://localhost:9200',
    auth: process.env.ELASTICSEARCH_AUTH
      ? {
          username: process.env.ELASTICSEARCH_USERNAME || 'elastic',
          password: process.env.ELASTICSEARCH_PASSWORD || 'changeme',
        }
      : undefined,
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD,
  },
  kafka: {
    brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
    clientId: 'search-service',
    groupId: 'search-service-group',
  },
  cache: {
    searchResultsTTL: 300, // 5 minutes in seconds
  },
  search: {
    defaultPageSize: 20,
    maxPageSize: 100,
    autocompleteMinLength: 2,
    autocompleteMaxResults: 10,
  },
};
