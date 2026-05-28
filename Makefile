.PHONY: help setup install build clean dev dev-down dev-clean test lint

help: ## Show this help message
	@echo 'Usage: make [target]'
	@echo ''
	@echo 'Available targets:'
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  %-15s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

setup: ## Run initial setup
	@./scripts/setup.sh

install: ## Install all dependencies
	@npm install
	@cd shared/types && npm install
	@cd shared/utils && npm install

build: ## Build all packages
	@echo "Building shared packages..."
	@cd shared/types && npm run build
	@cd shared/utils && npm run build
	@echo "✅ Build complete"

clean: ## Clean all build artifacts
	@echo "Cleaning build artifacts..."
	@find . -name "dist" -type d -exec rm -rf {} + 2>/dev/null || true
	@find . -name "node_modules" -type d -exec rm -rf {} + 2>/dev/null || true
	@echo "✅ Clean complete"

dev: ## Start infrastructure services
	@docker-compose up -d
	@echo "✅ Infrastructure services started"
	@echo "PostgreSQL: localhost:5432"
	@echo "Redis: localhost:6379"
	@echo "Kafka: localhost:9092"
	@echo "Elasticsearch: localhost:9200"

dev-down: ## Stop infrastructure services
	@docker-compose down
	@echo "✅ Infrastructure services stopped"

dev-clean: ## Stop and remove all volumes
	@docker-compose down -v
	@echo "✅ Infrastructure services stopped and volumes removed"

test: ## Run all tests
	@npm run test --workspaces

lint: ## Lint all code
	@npm run lint

logs: ## Show logs from all infrastructure services
	@docker-compose logs -f

ps: ## Show status of infrastructure services
	@docker-compose ps

# CI/CD targets
.PHONY: docker-build docker-push docker-tag deploy-staging deploy-production rollback-staging rollback-production smoke-test smoke-test-local smoke-test-staging smoke-test-production logs-staging logs-production status-staging status-production security-scan update-deps ci-local

docker-build: ## Build all Docker images
	@echo "Building Docker images..."
	@for service in auth gateway product order payment notification search recommendation analytics; do \
		echo "Building $$service..."; \
		docker build -t commercesphere/$$service:latest -f services/$$service/Dockerfile .; \
	done

docker-push: ## Push Docker images to registry
	@echo "Pushing Docker images..."
	@for service in auth gateway product order payment notification search recommendation analytics; do \
		echo "Pushing $$service..."; \
		docker push commercesphere/$$service:latest; \
	done

docker-tag: ## Tag Docker images with version (Usage: make docker-tag VERSION=v1.0.0)
	@if [ -z "$(VERSION)" ]; then echo "VERSION is required. Usage: make docker-tag VERSION=v1.0.0"; exit 1; fi
	@echo "Tagging Docker images with version $(VERSION)..."
	@for service in auth gateway product order payment notification search recommendation analytics; do \
		docker tag commercesphere/$$service:latest commercesphere/$$service:$(VERSION); \
	done

deploy-staging: ## Deploy to staging environment
	@echo "Deploying to staging..."
	kubectl apply -f kubernetes/ --namespace=staging
	@echo "Waiting for rollout..."
	@for service in auth gateway product order payment notification search recommendation analytics; do \
		kubectl rollout status deployment/$$service-service --namespace=staging --timeout=5m; \
	done

deploy-production: ## Deploy to production environment
	@echo "Deploying to production..."
	@echo "⚠️  This will deploy to production. Are you sure? [y/N]" && read ans && [ $${ans:-N} = y ]
	kubectl apply -f kubernetes/ --namespace=production
	@echo "Waiting for rollout..."
	@for service in auth gateway product order payment notification search recommendation analytics; do \
		kubectl rollout status deployment/$$service-service --namespace=production --timeout=10m; \
	done

rollback-staging: ## Rollback staging deployment
	@echo "Rolling back staging deployment..."
	@for service in auth gateway product order payment notification search recommendation analytics; do \
		kubectl rollout undo deployment/$$service-service --namespace=staging; \
	done

rollback-production: ## Rollback production deployment
	@echo "Rolling back production deployment..."
	@echo "⚠️  This will rollback production. Are you sure? [y/N]" && read ans && [ $${ans:-N} = y ]
	@for service in auth gateway product order payment notification search recommendation analytics; do \
		kubectl rollout undo deployment/$$service-service --namespace=production; \
	done

smoke-test: ## Run smoke tests (Usage: make smoke-test ENV=staging)
	@if [ -z "$(ENV)" ]; then echo "ENV is required. Usage: make smoke-test ENV=staging"; exit 1; fi
	chmod +x scripts/smoke-tests.sh
	./scripts/smoke-tests.sh $(ENV)

smoke-test-local: ## Run smoke tests against local environment
	chmod +x scripts/smoke-tests.sh
	./scripts/smoke-tests.sh local

smoke-test-staging: ## Run smoke tests against staging
	chmod +x scripts/smoke-tests.sh
	./scripts/smoke-tests.sh staging

smoke-test-production: ## Run smoke tests against production
	chmod +x scripts/smoke-tests.sh
	./scripts/smoke-tests.sh production

logs-staging: ## View logs from staging (Usage: make logs-staging SERVICE=product)
	@if [ -z "$(SERVICE)" ]; then echo "SERVICE is required. Usage: make logs-staging SERVICE=product"; exit 1; fi
	kubectl logs -f deployment/$(SERVICE)-service --namespace=staging

logs-production: ## View logs from production (Usage: make logs-production SERVICE=product)
	@if [ -z "$(SERVICE)" ]; then echo "SERVICE is required. Usage: make logs-production SERVICE=product"; exit 1; fi
	kubectl logs -f deployment/$(SERVICE)-service --namespace=production

status-staging: ## Check status of staging deployments
	kubectl get deployments,pods,services --namespace=staging

status-production: ## Check status of production deployments
	kubectl get deployments,pods,services --namespace=production

security-scan: ## Run security scans
	npm audit
	npm audit --workspaces

update-deps: ## Update dependencies
	npm update
	npm update --workspaces

ci-local: ## Run CI pipeline locally
	@echo "Running CI pipeline locally..."
	make lint
	make build
	make test
	@echo "✅ CI pipeline completed successfully"

# Integration test targets
.PHONY: test-integration test-integration-setup build-test-images test-integration-order test-integration-cancellation test-integration-search test-integration-notification test-integration-recommendation test-integration-analytics

build-test-images: ## Build Docker images for integration tests
	@echo "Building test Docker images..."
	@for service in auth gateway product order payment notification search analytics; do \
		echo "Building $$service:test..."; \
		docker build -t commercesphere/$$service:test services/$$service; \
	done
	@echo "✅ Test images built successfully"

test-integration-setup: ## Install integration test dependencies
	@echo "Installing integration test dependencies..."
	@cd tests/integration && npm install
	@echo "✅ Integration test setup complete"

test-integration: ## Run all integration tests
	@echo "Running integration tests..."
	@cd tests/integration && ./run-tests.sh
	@echo "✅ Integration tests complete"

test-integration-order: ## Run order flow integration test
	@cd tests/integration && ./run-tests.sh --test order-flow.test.ts

test-integration-cancellation: ## Run order cancellation integration test
	@cd tests/integration && ./run-tests.sh --test order-cancellation.test.ts

test-integration-search: ## Run product search integration test
	@cd tests/integration && ./run-tests.sh --test product-search.test.ts

test-integration-notification: ## Run notification delivery integration test
	@cd tests/integration && ./run-tests.sh --test notification-delivery.test.ts

test-integration-recommendation: ## Run recommendation generation integration test
	@cd tests/integration && ./run-tests.sh --test recommendation-generation.test.ts

test-integration-analytics: ## Run analytics metrics integration test
	@cd tests/integration && ./run-tests.sh --test analytics-metrics.test.ts
