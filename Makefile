.PHONY: install dev test typecheck lint build prisma-generate prisma-migrate up down logs clean

NPM ?= npm
COMPOSE_FILE := ops/docker/docker-compose.yml
COMPOSE := docker compose -f $(COMPOSE_FILE)

install:
	$(NPM) install

dev:
	$(COMPOSE) up --build

up:
	$(COMPOSE) up --build -d

down:
	$(COMPOSE) down

logs:
	$(COMPOSE) logs -f

test:
	$(NPM) test --workspaces --if-present

typecheck:
	$(NPM) run typecheck --workspaces --if-present

lint:
	$(NPM) run lint --workspaces --if-present

build:
	$(NPM) run build --workspaces --if-present

prisma-generate:
	cd backend && npx prisma generate --schema=prisma/schema.prisma

prisma-migrate:
	cd backend && npx prisma migrate deploy --schema=prisma/schema.prisma

clean:
	rm -rf backend/dist frontend/dist shared/dist
	rm -rf backend/node_modules frontend/node_modules shared/node_modules node_modules
