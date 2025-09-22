ENV_FILE ?= .env
GO_CMD ?= go
SQLC_CMD ?= sqlc
MIGRATE_CMD ?= migrate
DOCKER_COMPOSE ?= docker compose

ifneq (,$(wildcard $(ENV_FILE)))
include $(ENV_FILE)
export
endif

.PHONY: dev migrate migrate-down sqlc seed test stop

dev:
	$(DOCKER_COMPOSE) -f infra/docker-compose.yml up -d postgres redis
	$(GO_CMD) run ./api/cmd/api

stop:
	$(DOCKER_COMPOSE) -f infra/docker-compose.yml down

migrate:
	@if ! command -v $(MIGRATE_CMD) >/dev/null 2>&1; then \
		echo "migrate CLI não encontrado. Instale: https://github.com/golang-migrate/migrate"; \
		exit 1; \
	fi
	$(MIGRATE_CMD) -path api/migrations -database "$(DB_DSN)" up

migrate-down:
	@if ! command -v $(MIGRATE_CMD) >/dev/null 2>&1; then \
		echo "migrate CLI não encontrado. Instale: https://github.com/golang-migrate/migrate"; \
		exit 1; \
	fi
	$(MIGRATE_CMD) -path api/migrations -database "$(DB_DSN)" down 1

sqlc:
	@if ! command -v $(SQLC_CMD) >/dev/null 2>&1; then \
		echo "sqlc não encontrado. Instale: https://docs.sqlc.dev"; \
		exit 1; \
	fi
	$(SQLC_CMD) generate

seed:
	@if [ -z "$(DB_DSN)" ]; then \
		echo "DB_DSN não definido"; \
		exit 1; \
	fi
	psql "$(DB_DSN)" -f infra/seeds/seed.sql

test:
	$(GO_CMD) test ./api/...
