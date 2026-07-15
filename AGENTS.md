# AGENTS.md

The primary agent operating guide lives in [`agent.md`](agent.md) (mission,
product boundary, invariants, repo map, coding/security rules). Read it first.

Standard commands are documented in [`README.md`](README.md) (§Local
Development, §Quick Start), [`CONTRIBUTING.md`](CONTRIBUTING.md), and the root
[`package.json`](package.json) scripts. Do not duplicate them here.

## Cursor Cloud specific instructions

The dev environment (Rust 1.96.0 via `rust-toolchain.toml`, Node, Bun at
`~/.bun/bin`, PostgreSQL 17 + pgvector, JS deps, Rust deps) is already installed
and persisted in the VM snapshot. Only the non-obvious startup/run caveats below
are needed to bring the stack up.

### Services

| Service | Command | Port | Notes |
| --- | --- | --- | --- |
| PostgreSQL 17 + pgvector | `sudo pg_ctlcluster 17 main start` | 5432 | Not auto-started on boot; start it first. |
| `energon-api` (Rust/Axum) | `bun run api:dev` | 3001 | Runs migrations on startup. Falls back to in-memory storage if `DATABASE_URL` is unset (demo only). |
| `apps/web` (Next.js + Better Auth) | `bun run web:dev` | 3000 | Operator dashboard + login; mints EdDSA JWTs and serves the JWKS the API verifies. |
| `energon-worker` (optional) | `cargo run -p energon-worker` | — | Embedding worker; needs `OPENAI_API_KEY`. API falls back to recency retrieval without it. |

### Startup caveats (non-obvious)

- Postgres does not auto-start after a VM restart. Run
  `sudo pg_ctlcluster 17 main start` before running the API or web app.
- The DB is provisioned as role/password `energon`/`energon`, database
  `energon` (matching the default `DATABASE_URL`). The `energon` role was granted
  `SUPERUSER` because the `0001_identity` migration runs
  `CREATE EXTENSION vector` / `pg_trgm`, which requires superuser. Do not
  downgrade the role or migrations will fail with `permission denied to create
  extension "vector"`.
- The API and web app need env vars set before launch. A shell-sourceable env
  file lives at `~/energon.env` (kept outside the repo; contains
  `DATABASE_URL`, `ENERGON_API_KEY_PEPPER`, `ENERGON_ADMIN_TOKEN`,
  `BETTER_AUTH_SECRET`, JWKS/issuer/audience, and the web base URLs). Run
  `source ~/energon.env` in each service shell. See `.env.example` for the full
  list and meanings.
- Operator (dashboard) auth is a two-service flow: the web app mints EdDSA JWTs
  and the Rust API verifies them against `ENERGON_JWKS_URL`
  (`http://localhost:3000/api/auth/jwks`). `ENERGON_JWT_ISSUER`
  (`http://localhost:3000`) and `ENERGON_JWT_AUDIENCE` (`energon-api`) must match
  between the API env and `apps/web/lib/auth.ts`, and the web app must be running
  for management routes (`/v1/orgs/...`) to authorize.
- `bun run web:dev` uses webpack (`next dev --webpack`); `web:build` uses
  Turbopack. Both work.

### Fast core-API smoke test (no browser)

With Postgres up and the API running, bootstrap an agent with
`ENERGON_ADMIN_TOKEN` (`POST /v1/admin/agents`), then exercise
`POST /v1/memory/write` → `POST /v1/context/build` →
`GET /v1/audit/context/{request_id}` with the returned `eos_live_...` key. See
[`docs/api.md`](docs/api.md) for request bodies.

### Tests

- `cargo test --workspace` runs without a DB. One `energon-db` test
  (`payments::persists_receipts_and_usage_events`) is `#[ignore]` and needs a
  migrated Postgres; run it with `DATABASE_URL` set via
  `cargo test -p energon-db -- --ignored`.
