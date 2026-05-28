import { TestContainerManager } from './test-containers';
import { TestServiceManager } from './test-services';
import { ApiClient } from '../helpers/api-client';

export interface E2ETestEnvironment {
  containerManager: TestContainerManager;
  serviceManager: TestServiceManager;
  apiClient: ApiClient;
  gatewayUrl: string;
}

export class E2EEnvironmentManager {
  private containerManager?: TestContainerManager;
  private serviceManager?: TestServiceManager;

  async setup(): Promise<E2ETestEnvironment> {
    console.log('Setting up E2E test environment...');


    this.containerManager = new TestContainerManager();
    const containers = await this.containerManager.startAll();


    this.serviceManager = new TestServiceManager();
    await this.serviceManager.startAll(containers);
    const urls = this.serviceManager.getServiceUrls();


    const apiClient = new ApiClient(urls.gateway);

    console.log('E2E test environment ready');

    return {
      containerManager: this.containerManager,
      serviceManager: this.serviceManager,
      apiClient,
      gatewayUrl: urls.gateway
    };
  }

  async teardown(): Promise<void> {
    console.log('Tearing down E2E test environment...');
    
    if (this.serviceManager) {
      await this.serviceManager.stopAll();
    }
    
    if (this.containerManager) {
      await this.containerManager.stopAll();
    }

    console.log('E2E test environment cleaned up');
  }
}
