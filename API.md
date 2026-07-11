# API.md

Base URL: `http://localhost:3000`

All error responses share the same shape:

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "...",
  "correlationId": "..."
}
```

Every response (success or error) carries an `x-correlation-id` response
header — reuse the one from the request if you send it, otherwise the server
generates one.

---

## Identity

### `POST /auth/register`

Public — no `Authorization` header needed. `email` is unique **per brand**, not
globally — the same email can register under different `brandId`s.

```bash
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password123","brandId":1}'
```

Response `201`:

```json
{
  "id": 1,
  "email": "user@example.com",
  "brandId": 1,
  "createdAt": "2026-07-11T12:00:00.000Z"
}
```

`409 Conflict` if that email is already registered under the same `brandId`.

### `POST /auth/login`

Public. `brandId` is required in the body — since email is only unique per
brand, the server needs to know which brand's account to check.

```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password123","brandId":1}'
```

Response `201`:

```json
{ "accessToken": "eyJhbGciOiJIUzI1NiIs..." }
```

`401 Unauthorized` (`"Invalid credentials"`) for both "no such user" and "wrong
password" — the message is intentionally identical so it doesn't leak which
one failed.

### `GET /profile/me`

Requires `Authorization: Bearer <accessToken>`. Returns the profile of the
token's own user — `brandId` comes from the token, never from a param, so it
can't be spoofed.

```bash
curl http://localhost:3000/profile/me \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..."
```

Response `200`:

```json
{
  "id": 1,
  "email": "user@example.com",
  "brandId": 1,
  "createdAt": "2026-07-11T12:00:00.000Z"
}
```

`401 Unauthorized` with no token, an expired token, or a malformed token.

---

## Callbacks (PSP / GSP webhook stubs)

Both endpoints require:

- `x-brand-id` header — integer, identifies the tenant the event belongs to.
- `x-webhook-signature` header — hex HMAC-SHA256 of the **raw JSON body**,
  signed with `WEBHOOK_SECRET`. See [Signing a webhook request](#signing-a-webhook-request) below.

Body:

```json
{ "webhookId": "evt_123", "payload": { "anything": "the provider sends" } }
```

`webhookId` + `provider` (the URL param) + `brandId` together form the
idempotency key. Sending the same `webhookId` again for the same
`provider`/`brandId` is safely deduplicated — the second call returns
`"status": "duplicated"` and nothing new is written to the database. The same
`webhookId` under a **different** `brandId` is treated as a brand-new event
(tenants don't share an idempotency namespace).

### `POST /webhooks/psp/:provider`

```bash
SECRET="$WEBHOOK_SECRET"
BODY='{"webhookId":"evt_123","payload":{"amount":100}}'
SIGNATURE=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$SECRET" -hex | sed 's/^.* //')

curl -X POST http://localhost:3000/webhooks/psp/stripe \
  -H "Content-Type: application/json" \
  -H "x-brand-id: 1" \
  -H "x-webhook-signature: $SIGNATURE" \
  -d "$BODY"
```

Response `201` (first time):

```json
{
  "providerType": "PSP",
  "provider": "stripe",
  "brandId": 1,
  "idempotencyKey": "evt_123",
  "status": "created",
  "accepted": true
}
```

Same call again → `"status": "duplicated"`, same `idempotencyKey`, `202`-worthy
semantics returned as `201` with the flag in the body (kept simple for the
stub — see DECISIONS.md).

### `POST /webhooks/gsp/:provider`

Identical contract, different path:

```bash
curl -X POST http://localhost:3000/webhooks/gsp/betsoft \
  -H "Content-Type: application/json" \
  -H "x-brand-id: 1" \
  -H "x-webhook-signature: $SIGNATURE" \
  -d "$BODY"
```

### Signing a webhook request

**curl / shell:**

```bash
SIGNATURE=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$WEBHOOK_SECRET" -hex | sed 's/^.* //')
```

**Postman** — add a Pre-request Script on the request:

```js
const secret = pm.environment.get('WEBHOOK_SECRET'); // or hardcode for local testing
const body = pm.request.body.raw;
const signature = CryptoJS.HmacSHA256(body, secret).toString(CryptoJS.enc.Hex);
pm.request.headers.upsert({ key: 'x-webhook-signature', value: signature });
```

Set Body to `raw` / `JSON` — the script signs exactly the bytes Postman sends,
so no manual copy-pasting of a signature is needed.

Missing or invalid signature → `401 Unauthorized`.
Missing/invalid `x-brand-id` → `400 Bad Request`.

---

## Health

### `GET /health`

```bash
curl http://localhost:3000/health
```

```json
{ "status": "ok", "message": "Service is healthy" }
```
