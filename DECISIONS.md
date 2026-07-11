# DECISIONS.md

Design choices made in this project, and the trade-offs that come with each one.

## Glossary

- **brandId** — an integer that identifies one tenant (one "brand" or customer)
  in this multi-tenant system. Every user, session, and webhook event belongs
  to exactly one `brandId`. Two different brands are fully isolated from each
  other — one brand can never see another brand's data. There is no separate
  `Brand` table — `brandId` is just an opaque tenant identifier, any positive
  integer is a valid one. This matches the minimal data model asked for
  (users, sessions, raw events, idempotency keys — no brands table), so it is
  intentional, not an oversight.
- **provider** — this word is used in two different ways in this project:
  - **Provider type** — `PSP` (Payment Service Provider) or `GSP` (Game
    Service Provider). This is a fixed value with only two options, used
    internally (`Provider.PSP` / `Provider.GSP` in the database).
  - **`:provider` in the URL** — a free-text name in the webhook path. For
    example `stripe` in `POST /webhooks/psp/stripe`, or `test` in
    `POST /webhooks/psp/test`. It is not checked against any list, and it does
    not decide which handler runs — that is already decided by `/psp/` vs
    `/gsp/` in the path. Its only real job is to make the idempotency key more
    specific: `${providerType}:${provider}:${webhookId}`. This matters if one
    brand has more than one PSP integration (say, two payment companies) — if
    both happened to send an event with the same `webhookId`, without this
    segment they would collide as "the same event" and the second one would
    be dropped as a duplicate. It is also included in the response for
    tracing which company an event actually came from.

## Modular monolith, not microservices

`identity`, `callbacks`, `persistence`, `common`, `health` are separate Nest
modules. Each module has its own controllers and services, and shares code
only through exported providers. But all of them run in one process, not as
separate services.

Splitting `identity` and `callbacks` into separate microservices would add
network calls, service discovery, and distributed transactions. For a project
this size, that is extra complexity with no real benefit.

## Lightweight DDD, not full tactical DDD

There is a simple Domain/Application/Infrastructure/Presentation structure:
services hold the business logic, repositories wrap Prisma, and controllers
stay thin. But there are no Aggregates, Value Objects, or domain events.

Full tactical DDD is useful for complex domains. Here, with only four Prisma
models, it would mostly add extra structure without solving a real problem.

## Strategy + Factory for PSP/GSP callback handling

`CallbackHandler` is an abstract class. It holds the one piece of logic that
actually matters: the idempotency transaction (check → insert → handle a
race). `PspCallbackHandler` and `GspCallbackHandler` extend it and only differ
in `providerType`. `CallbackHandlerFactory.create(providerType)` picks the
right one — Nest already created both handlers through dependency injection,
so the factory just selects one, it does not build it with `new`.

This design keeps balance logic completely separate from callback handling: a
concrete handler can only save a raw event to the database. It has no way to
touch a balance or trigger a payout, because that logic simply does not exist
in this class. Adding a third provider later means adding one small subclass
and one line in the factory — no copy-pasted transaction code.

## Idempotency: the DB constraint is the real guarantee, not the in-code check

`IdempotencyKey` has a database constraint: `@@unique([brandId, key])`. The
handler also does a `findUnique` check first, to avoid an unnecessary
transaction in the common case. But the real protection against duplicates
comes from the database constraint, not from this check.

If two requests arrive at almost the same time, both can pass the
`findUnique` check before either one finishes writing. The database then
rejects the second `INSERT` with error `P2002` (unique constraint violation).
The handler catches this specific error and returns the already-stored
response with `"status": "duplicated"`.

An in-code-only check (for example, a `Map` kept in memory) would not work if
the app runs as more than one instance — each instance would have its own
`Map`. The database constraint works correctly no matter how many app
instances are running.

`RawWebhook` itself has no unique constraint. It does not need one: both rows
(`IdempotencyKey` and `RawWebhook`) are written inside the same database
transaction. If the `IdempotencyKey` insert fails, the whole transaction rolls
back, so no `RawWebhook` row is created either.

A duplicated callback still gets HTTP `201`, the same as a new one — only the
`status` field in the body changes (`"created"` vs `"duplicated"`). The HTTP
status code only tells the caller "the callback is safely stored, stop
retrying"; whether it was new or already seen is a body-level detail, not a
transport-level one. This also keeps the contract simple: a provider retrying
a webhook only has to check for any `2xx`, not treat `200` and `201`
differently depending on whether we had seen the event before.

## Tenant isolation: explicit `brandId` everywhere, no `TenantGuard`

Every query that touches tenant data takes `brandId` as an explicit
parameter — for example `findByEmail(email, brandId)`, `findById(id,
brandId)`, and `CallbackHandler.handle(provider, brandId, dto)`. There is no
hidden "current tenant" object and no guard that silently filters queries.
`brandId` comes from a different place depending on the route:

- **Identity routes** — `brandId` comes from the JWT token (`GET /profile/me`
  reads `req.user.brandId`, never from a URL or query parameter). A logged-in
  user cannot fake a different `brandId`.
- **Webhook routes** — `brandId` comes from the `x-brand-id` header. There is
  no user session on an incoming provider callback, so there is nothing else
  to read it from.

A separate `TenantGuard` would make sense if some protected route received
`brandId` from the request itself and needed to check it against the token.
That situation does not exist anywhere in this codebase yet, so adding a
guard now would just be a guard that does nothing.

`email` is unique per `(email, brandId)`, not globally. Otherwise, two
different brands could never have a customer with the same email address —
and in a real multi-tenant system, that happens all the time, it is not a
rare edge case.

## Webhook authenticity: HMAC-SHA256 over the raw body, one global secret

`/webhooks/psp/:provider` and `/webhooks/gsp/:provider` have no login by
design — they represent an external provider calling us, not a logged-in
user. Without any check, anyone who knows a `brandId` could send fake events.
`WebhookSignatureGuard` requires an `x-webhook-signature` header: an
HMAC-SHA256 signature of the exact raw request body, compared with
`crypto.timingSafeEqual` instead of `===` (a plain `===` comparison can leak
timing information about how many bytes already matched). This is the same
idea real providers like Stripe use to sign their webhooks.

Two things were simplified on purpose:

- **The signature covers the raw body.** This needs NestJS's `rawBody: true`
  option, which captures the exact bytes before they get parsed as JSON.
  Without it, re-serializing the parsed object could produce slightly
  different bytes (different key order, different spacing) than what the
  caller actually signed, and a correct signature could fail to match.
- **One global `WEBHOOK_SECRET`**, not a separate secret per brand or
  provider. A real system would give each (brand, provider) pair its own
  secret, stored in the database. That is a real feature on its own (storage,
  rotation, lookup), and it is out of scope for this stub.

## Correlation id: set in the middleware, not the interceptor

`CorrelationIdMiddleware` runs before everything else, including guards. It
reads or generates the correlation id, and also sets the `x-correlation-id`
header on the response.

At first, that header was set inside `CorrelationIdInterceptor` instead. But
Nest's request pipeline runs in this order: `Middleware → Guards →
Interceptors → Pipes → Handler`. So a request rejected by a guard — for
example a 401 from `JwtAuthGuard` — never reaches the interceptor, and the
header would be missing exactly on the error responses where it matters most
for debugging. Moving the header-set into the middleware guarantees it is
present on every response, no matter where the request fails. The interceptor
still runs afterward and does the one thing that has to happen after the
handler: logging `method · path · status · duration`.

## Structured errors via a single global filter

`AllExceptionsFilter` turns every thrown error (both normal HTTP exceptions
and anything unexpected) into one shape: `{ statusCode, error, message,
correlationId }`. It reads `correlationId` from the request header, which the
middleware has already guaranteed is there — so it does not depend on every
call site remembering to pass it along.

## Prisma 7 + `db push`, no migration files

`entrypoint.sh` runs `prisma db push` on every container start, instead of
`prisma migrate deploy` with checked-in migration files. The trade-off: there
is no migration history, and if a schema change conflicts with data that is
already in the database, it needs the `--accept-data-loss` flag (or wiping
the dev database volume). That is fine for a project where the database only
holds disposable dev/demo data — it would not be fine in front of a database
with real user data. If this became a real service, the next step would be
adding real `prisma/migrations` files and switching the entrypoint to
`migrate deploy`.

## Testing: e2e specs generate their own random tenant data, no seed script

Unit tests (`*.spec.ts`) fully mock `PrismaService` — no database involved.
E2E tests (`test/*.e2e-spec.ts`) run against a real Postgres and a real Nest
app, using `test/utils/create-test-app.ts`, which starts the app exactly like
`main.ts` does (same guards, filters, pipes, and `rawBody` option).

Instead of a seed script, each test generates its own random `brandId`,
email, and `webhookId` (`randomBrandId()`). This makes the test suite
repeatable against a database that keeps its data between runs, with no
cleanup step, and avoids unique-constraint collisions between different test
runs or different tests. A seed script would need to be safe to run more than
once, which is more complexity than this project needs.

Unit tests need `@prisma/client` to be generated. E2E tests additionally need
a reachable Postgres and `WEBHOOK_SECRET` / `JWT_SECRET` set in the
environment. Both run against the `build` stage of the Dockerfile — see
README.md for the exact commands.

## Docker: `build` / `prod-deps` / `runtime` stages

The `runtime` image only copies `node_modules` from `prod-deps` (`npm ci
--omit=dev`). That means `jest`, `ts-jest`, `@nestjs/testing`, and
`supertest` are not in the image that actually runs "in production". Tests
instead run against the `build` stage (which has a full `npm ci`), using
`docker build --target build`. This keeps the deployable image small, while
still letting anyone run the whole test suite with one Docker command and no
local Node.js install.

## PSP/GSP are fully mocked

There is no real payment or game-service provider anywhere in this project.
`:provider` in `/webhooks/psp/:provider` is just free text in the URL
(`stripe`, `betsoft`, `test` — anything), not something checked against a
real list of integrations. A real provider's actual signature scheme, retry
rules, and payload shape are out of scope here. The goal of this project is
the plumbing around callbacks — receiving them safely, deduplicating them,
and keeping tenants isolated — not integrating with one specific PSP or GSP.
