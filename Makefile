# Common tasks. Run `make help` for the list.
.PHONY: help install test test-e2e audit security docker-up docker-down

help: ## Show available targets
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  %-12s %s\n", $$1, $$2}'

install: ## Install dependencies from the lockfile
	npm ci

test: ## Run unit tests (needs Postgres, see TEST_DATABASE_URL)
	npm test

test-e2e: ## Run browser tests (needs network; uses the live stream)
	npm run test:e2e

audit: ## Fail on high-severity vulnerabilities in production dependencies
	npm audit --omit=dev --audit-level=high

security: audit ## Run all security checks
	@echo "Dev-tool advisories (not shipped, reported only):"
	@npm audit --audit-level=high 2>&1 | grep -E 'vulnerabilit' || true

docker-up: ## Start the production stack
	docker compose --profile prod up -d --build

docker-down: ## Stop the production stack
	docker compose --profile prod down
