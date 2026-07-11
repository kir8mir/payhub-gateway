# payhub-gateway

A small backend service exploring reliable payment-provider callback handling with
multi-tenant isolation — the part of fintech/iGaming payment infrastructure that
sits between "PSP/GSP sends us a webhook" and "we can trust and process it safely."

PSP and GSP are fully mocked (no
real external providers, no balance/ledger logic) — the focus is on the plumbing
around them: identity, callback ingestion, idempotency, and tenant isolation.

## Stack

- Node.js 22, NestJS + TypeScript
- Prisma 7 (`@prisma/adapter-pg`) + PostgreSQL
- Docker / docker-compose

## What's implemented

- **identity** — register / login (JWT) / `GET /profile/me`, email scoped per
  brand (`@@unique([email, brandId])`), not globally.
- **callbacks** — `POST /webhooks/psp/:provider` and `POST /webhooks/gsp/:provider`,
  protected by an HMAC-SHA256 signature guard, routed through a Strategy + Factory
  pair (`CallbackHandlerFactory` → `PspCallbackHandler` / `GspCallbackHandler`) so
  the adapters can only ever persist a raw event — never touch a balance.
  Idempotent by construction: a DB-level unique constraint
  (`@@unique([brandId, key])`) is the actual source of truth, not just an
  in-code check, so concurrent duplicate callbacks can't race past it.
- **tenant isolation** — every query is explicitly scoped by `brandId`, sourced
  from the JWT for identity routes and from the `x-brand-id` header for webhooks.
- **observability** — every request gets a correlation id (`x-correlation-id`,
  generated if the caller didn't send one), guaranteed on every response
  including errors; every request is logged with method/path/status/duration.
- **structured errors** — a global exception filter returns
  `{ statusCode, error, message, correlationId }` for every failure.

See [API.md](API.md) for request examples and [DECISIONS.md](DECISIONS.md) for
the reasoning behind these choices and the trade-offs that come with them.

## Architecture
<img width="2004" height="930" alt="feature-relations drawio" src="https://github.com/user-attachments/assets/6fe6d49c-581b-424c-a926-1b310e4eaaf7" />
Modules, the Strategy+Factory callback handler pair, tenant-scoped
repositories, and cross-cutting concerns (guards, correlation id, structured
errors). See [DECISIONS.md](DECISIONS.md) for the reasoning behind each piece.

## Prerequisites

- Docker + Docker Compose

Nothing else — Node/npm/Prisma are only used inside the containers.

## Run it

```bash
cp .env.example .env
# edit .env if you want different secrets/ports, defaults work as-is

docker compose up --build
```

This builds the app image, starts PostgreSQL, waits for it to be healthy, then
starts the API. On every boot the app runs `prisma db push` against the DB
(see [DECISIONS.md](DECISIONS.md) for why this project uses `db push` instead of
migration files), so the schema is always in sync — no separate migrate step.

- API: http://localhost:3000
- Health check: `GET /health`
- PostgreSQL is also reachable on the host at `localhost:15432` (mapped from the
  container's internal `5432`, in case you already have a local Postgres on the
  default port)

## Running the tests

Tests run against the `build` stage of the image (it has the dev dependencies
the `runtime` stage intentionally doesn't ship with):

```bash
docker build --target build -t payhub-test .
```

**Unit tests** (no DB required):

```bash
docker run --rm payhub-test npm test
```

**E2E tests** (need a running Postgres — start it first):

```bash
docker compose up -d payhub-db
docker run --rm --env-file .env --network payhub-gateway_default payhub-test npm run test:e2e
```

`.env`'s `DATABASE_URL` already points at `payhub-db` (the in-network hostname
used by docker-compose), so `--env-file .env` is all that's needed — no
override required. E2E tests generate their own random
`brandId`/email/webhookId per run, so they don't need any seed data and are
safe to re-run against a persistent dev database.

## Project structure

```
src/
  identity/     auth (register/login/JWT), profile
  callbacks/    PSP/GSP webhook controllers, Strategy+Factory handlers
  common/       guards, interceptors, middleware, exception filter
  persistence/  PrismaService / PrismaModule
  health/       health check endpoint
test/           e2e specs (idempotency, tenant leakage, auth guard)
```

## Deliverables

- [API.md](API.md) — request/response examples for every endpoint
- [DECISIONS.md](DECISIONS.md) — design choices and trade-offs
