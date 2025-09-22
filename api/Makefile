GO_CMD ?= go
SQLC_CMD ?= sqlc
MIGRATE_CMD ?= migrate

.PHONY: run test sqlc migrate lint

run:
	$(GO_CMD) run ./cmd/api

test:
	$(GO_CMD) test ./...

sqlc:
	$(SQLC_CMD) generate --file sqlc.yaml

migrate:
	$(MIGRATE_CMD) -path migrations -database "$(DB_DSN)" up
