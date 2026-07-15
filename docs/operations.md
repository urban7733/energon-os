# Energon OS Operations

## Required Production Environment

```txt
DATABASE_URL              shared by API, worker, and web (Better Auth)
ENERGON_API_KEY_PEPPER    peppers agent API key hashes
ENERGON_JWKS_URL          Better Auth JWKS endpoint for operator JWTs
BETTER_AUTH_SECRET        web app only
BETTER_AUTH_URL           web app public base URL
```

Optional (API):

```txt
ENERGON_BIND_ADDR=0.0.0.0:3000
ENERGON_ADMIN_TOKEN            bootstrap-only static admin gate
ENERGON_DEV_AUTH=false
ENERGON_RETRIEVAL_CANDIDATE_LIMIT=500
ENERGON_JWT_ISSUER             validate JWT iss (recommended)
ENERGON_JWT_AUDIENCE           validate JWT aud (recommended)
ENERGON_JWKS_REFRESH_SECONDS=300
ENERGON_WEB_ORIGIN             comma-separated CORS origins for the dashboard
ENERGON_RATE_LIMIT_RPS=20
ENERGON_RATE_LIMIT_BURST=40
ENERGON_MAX_BODY_BYTES=1048576
OPENAI_API_KEY                 enables query-time semantic retrieval
ENERGON_PRICE_MEMORY_WRITE_MICRO=1000
ENERGON_PRICE_MEMORY_PROMOTE_MICRO=1000
ENERGON_PRICE_CONTEXT_BUILD_MICRO=3000
ENERGON_PRICE_AUDIT_READ_MICRO=500
ENERGON_PRICE_VAULT_EXPORT_MICRO=5000
```

Optional (worker):

```txt
ENERGON_EMBEDDING_MODEL=text-embedding-3-small
ENERGON_EMBEDDING_BATCH_SIZE=16
ENERGON_WORKER_ONCE=false
```

See `.env.example` at the repo root for the complete annotated list.

## Migrations

Migrations are embedded into the API binary with `sqlx::migrate!` and run
automatically on startup whenever `DATABASE_URL` is set. Progress is tracked in
the `_sqlx_migrations` table.

All migration files are idempotent (`CREATE ... IF NOT EXISTS`), so databases
originally initialized through the docker-entrypoint-initdb mount converge
cleanly: on first boot sqlx re-applies each file as a no-op and records it.

The `./migrations:/docker-entrypoint-initdb.d` mount in docker-compose remains
as a first-boot convenience only.

## API

Run:

```bash
energon-api
```

The API refuses Postgres-backed startup unless `ENERGON_API_KEY_PEPPER` is configured.

Health / readiness:

```bash
curl http://127.0.0.1:3001/health
# {"status":"ok","service":"energon-os","version":"0.1.0","storage":"postgres","database":"connected"}
```

`status` becomes `degraded` and `database` becomes `unavailable` when the
Postgres probe fails. No configuration values are exposed.

## Rate Limiting

Token bucket per bearer credential (hashed) or client IP
(`x-forwarded-for`-aware): `ENERGON_RATE_LIMIT_RPS` (default 20) with
`ENERGON_RATE_LIMIT_BURST` (default 40). Exceeding it returns
`429 Too Many Requests`.

## Web App (Better Auth)

The Next.js app in `apps/web` owns human accounts, sessions, organizations,
and the JWKS endpoint. It requires a server runtime (no static export):

```bash
bun run web:build
bun run web:start
```

Better Auth tables live in the same Postgres (`migrations/0006_better_auth.sql`).
The Rust API never reads those tables; it only verifies JWTs against
`ENERGON_JWKS_URL` (`https://<web-host>/api/auth/jwks`).

## Worker

Run:

```bash
energon-worker
```

The worker requires:

```txt
DATABASE_URL
OPENAI_API_KEY
```

One-shot mode:

```bash
ENERGON_WORKER_ONCE=1 energon-worker
```

## Local Docker

With a Docker Compose plugin:

```bash
docker compose up --build
```

The API container listens on host port 3001 (container port 3000) so the web
dev server can keep host port 3000. Run worker profile:

```bash
docker compose --profile worker up --build
```

## Security Invariants

```txt
1. API keys are returned once and only hashes are stored.
2. Agent identity is resolved before memory retrieval.
3. Postgres selects candidates with the permission filter in SQL,
   then Rust verifies permissions again before packing.
4. Audit records are visible only to the creating agent/org.
5. Private memory is never promoted automatically.
6. Operator JWTs are org-scoped: the org claim must match the route.
7. ENERGON_ADMIN_TOKEN is bootstrap-only; day-to-day management is JWT-authed.
```
