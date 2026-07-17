# Energon OS — Agent Guide

This is the single, comprehensive operating guide for any agent (AI or human)
working in this repository. It explains the product, the long-term goal, the
full tech stack, the repository layout, the API, environment, commands, and the
rules you must follow.

Related docs (read as needed):

- [`README.md`](README.md) — public overview, quick start, product framing.
- [`AGENTS.md`](AGENTS.md) — Cursor Cloud specific setup/run caveats for this VM.
- [`hermes.md`](hermes.md) — the autonomous operator agent: mission, $1M/month
  goal, and growth playbook. Read this to understand *why* the product exists.
- [`CONTRIBUTING.md`](CONTRIBUTING.md), [`SECURITY.md`](SECURITY.md).
- [`docs/`](docs) — architecture, API, deployment, operations, crypto payments.

## Mission

Energon OS is the **permissioned memory and context layer for AI agent swarms**.

It answers one question:

```txt
Which agent may see which memory for this task?
```

Public claim:

```txt
Energon OS gives every AI agent the right memory, without leaking private memory.
```

It does **not** run agents, host agents, click browsers, execute workflows, make
payments, or become an agent platform. External agents live in other repos and
runtimes and call Energon through an API/SDK.

## What Energon OS is (the product)

Given a calling agent, Energon:

1. Identifies the agent (org, project, role, session, ownership).
2. Filters memory by permission **before** retrieval, ranking, or packing.
3. Retrieves relevant short-term and long-term memory.
4. Packs a compact **context pack** under a token budget.
5. Returns the pack to the external agent.
6. Records an **audit trail** of exactly which memory influenced the request.

Shared memory is stored once; private memory is an overlay; context is built
dynamically per request. Private memory never becomes shared automatically —
promotion is explicit, reasoned, and audited.

## Product boundary

Build inside this boundary:

- Agent identity, memory read/write APIs, permission filtering
- Short-term + long-term memory, retrieval over allowed memory
- Context packing, explicit promotion, audit logs
- Operator dashboard + public website

Do **not** build into this repo:

- Agent runtimes, browser automation, workflow execution
- Payment execution/orchestration, wallet custody
- Tool-use orchestration, hosted agent marketplace
- The autonomous-company operator itself (that is **Hermes**, a separate service)

## Long-term goal: an AI-native company run by Hermes

The broader vision is the **first fully AI-autonomous company**: a product that
markets, sells, supports, and improves itself with humans setting direction and
guardrails, not doing day-to-day operation.

- **Hermes** is the autonomous operator agent that runs on top of Energon
  (indexes the product, posts on X, runs growth loops, operates 24/7). Hermes is
  a **separate runtime** that calls Energon via API — it is not part of this
  memory core. Full spec in [`hermes.md`](hermes.md).
- **Revenue goal: $1,000,000 / month**, from **both** streams together:
  - **Agents** — metered pay-per-request via **x402** (USDC on Base): memory
    write, context build, promote, audit read, vault export.
  - **Users** — human subscription plans in USDC (Developer / Team / Enterprise).
  - Combined MRR ≥ $1M/month is the target; neither stream alone carries it.
- Strategy: make Energon **agent-discoverable** (MCP, registries, `llms.txt`),
  **agent-purchasable** (x402), and **agent-recommendable** — so demand scales
  with the number of autonomous agents coming online in swarms. Details in
  [`hermes.md`](hermes.md) → Growth playbook.

## Core invariants (non-negotiable)

- Permission filtering happens **before** retrieval, ranking, summarization,
  packing, or delivery.
- Shared memory is stored once. Private memory is an overlay.
- Context is built dynamically per request.
- Private memory never becomes shared automatically; promotion is explicit,
  requires a non-empty reason, and records a promotion audit entry.
- Audit logs record what memory influenced a context build.
- A denied memory item must never appear in a context pack, in logs meant for the
  agent, or in frontend response payloads.
- All paid usage is crypto-only (x402 / USDC). There is no fiat path.

## Context flow

```txt
External Agent
  -> Energon API
  -> Agent Identity
  -> Permission Filter        (never optional)
  -> Candidate Retrieval      (Postgres/pgvector may preselect)
  -> Context Broker
  -> Context Packer           (token budget)
  -> Audit Log
  -> Context Pack
  -> External Agent
```

Postgres may preselect candidates, but the Rust core must still verify
permissions before packing context.

## Memory model & scopes

```txt
open           all allowed agents in an org
org            all agents in the same org
project        agents assigned to the same project
role           agents with a matching role
agent_private  one specific agent
user_private   one user-approved context path
session         one temporary task/session
```

Promotion rule: `agent_private -> {open|org|project|role}` — explicit only, with
a reason and audit trail.

## Business model

- **Agent metered (x402 / USDC on Base)**: e.g. memory write ≈ $0.001, context
  build ≈ $0.003, audit read ≈ $0.0005, vault export ≈ $0.005 (see
  `docs/api.md`, and `ENERGON_PRICE_*_MICRO` env vars).
- **Human plans (USDC)**: Developer ≈ $99/mo, Team ≈ $499/mo, Enterprise from
  ≈ $2,500/mo (see `pricingPlans` in `apps/web/lib/site.ts`).
- Open-source core (Apache 2.0): permission engine, API, scopes, audit format,
  self-host path. Commercial: hosted API, dashboard, enterprise tenancy, SLA.

## Tech stack

### Backend (Rust workspace)

- **Rust 2024**, toolchain pinned to `1.96.0` (`rust-toolchain.toml`).
- **Tokio** async runtime; **Axum 0.8** HTTP (+ `tower-http` CORS).
- **sqlx 0.8** for explicit SQL against **PostgreSQL 17 + pgvector**.
- **jsonwebtoken** (EdDSA/Ed25519 JWT verification against JWKS), `sha2`,
  `rand`, `ring`, `base64`.
- **reqwest** (rustls) for OpenAI embeddings and the x402 facilitator.

Crates:

```txt
crates/energon-core    pure domain logic: memory, scopes, permissions, retrieval,
                       context brokering/packing, audit structs (no I/O deps)
crates/energon-api     Axum API: auth middleware, agent + operator routes, memory
                       writes, context builds, promotion, audit, x402, vault export
crates/energon-db      sqlx repositories: identity, API-key hashes, memory rows,
                       memory chunks/embeddings, audit, payments
crates/energon-worker  async worker: OpenAI embeddings -> pgvector chunks
```

### Frontend / web (`apps/web`)

- **Next.js 16** (App Router), **React 19**, **TypeScript 5.9**, **Bun** tooling.
- **Better Auth 1.6**: email/password + GitHub/Google/Apple social; `organization`
  + `jwt` (EdDSA/Ed25519) + Next.js cookies plugins. Sessions/orgs/users live in
  the **same Postgres** as the Rust API (`pg` / node-postgres).
- The dashboard **mints short-lived operator JWTs**; the Rust API verifies them
  against the Better Auth **JWKS** endpoint (`ENERGON_JWKS_URL`).
- **Two UI surfaces**:
  - **Marketing site** (`/`) — minimal, pure-black, hand-written CSS in
    `app/globals.css` (mono type, thin separators, no gradients).
  - **Operator dashboard** (`/dashboard`) — built with **Tailwind CSS v4 +
    shadcn/ui** (radix, tuned to the black brand), with a server-rendered
    **live-analytics** section (real org-scoped Postgres aggregates), an
    interactive console, toasts, and an animated "Create API key" action.
    Legacy element CSS is scoped to `.site-shell`/`.auth-shell` so it does not
    leak into shadcn components.
- `lucide-react` icons. `app/llms.txt` / `app/llms-full.txt` for LLM/GEO
  discovery; sitemap/robots/JSON-LD for SEO. The dashboard stays `noindex`.

### Data & infra

- **PostgreSQL 17 + pgvector** (`pgvector/pgvector:pg17`) — identity, memory,
  chunks/embeddings, audit, payments, and Better Auth tables.
- **OpenAI embeddings** (`text-embedding-3-small`) behind a provider interface
  (optional; falls back to recency + keyword retrieval).
- **MinIO / Cloudflare R2** for large documents (roadmap).
- **x402** crypto payment gate (USDC on Base) for paid agent routes.
- **Docker / docker-compose** for local infra only.

### Package managers / build

- **Cargo** (Rust) and **Bun** (JS; `bun.lock`). Root `package.json` orchestrates
  via `bun run` scripts. CI: `.github/workflows/ci.yml` (Rust fmt+test; web
  typecheck+build).

## Repository map

```txt
crates/                Rust workspace (core, api, db, worker)
apps/web/              Next.js site + Better Auth + operator dashboard
  app/                 routes: /, /login, /dashboard, /api/auth, llms.txt, etc.
  app/dashboard/       page.tsx, dashboard-analytics.tsx (server), dashboard-console.tsx (client)
  components/ui/       shadcn/ui components (dashboard only)
  lib/                 auth.ts, auth-client.ts, site.ts, analytics.ts, db.ts, utils.ts
migrations/            Postgres schema 0001..0007 (auto-run on API startup)
policies/              Cedar policy starting point
docs/                  architecture, api, deployment, operations, crypto-payments
README.md              public overview + quick start
agent.md               this guide
AGENTS.md              Cursor Cloud specific setup/run notes
hermes.md              autonomous operator agent + $1M/month goal + growth playbook
docker-compose.yml     postgres (+ minio), api, worker
.env.example           all environment variables with explanations
```

## API surface

Agent routes (bearer `eos_live_...` API keys; paid via x402 when enabled):

```txt
GET  /health
GET  /v1/billing/x402
POST /v1/memory/write
POST /v1/context/build
POST /v1/memory/promote
GET  /v1/vault/obsidian.zip
GET  /v1/audit/context/{request_id}
GET  /v1/audit/promotion/{promoted_memory_id}
```

Operator management routes (Better Auth EdDSA JWT; the `org` claim must equal
`{org_id}` or the API returns 403):

```txt
POST   /v1/orgs/{org_id}/agents
GET    /v1/orgs/{org_id}/agents
POST   /v1/orgs/{org_id}/agents/{agent_id}/keys
DELETE /v1/orgs/{org_id}/keys/{api_key_id}
GET    /v1/orgs/{org_id}/memories?scope=&limit=&offset=
DELETE /v1/orgs/{org_id}/memories/{memory_id}
GET    /v1/orgs/{org_id}/usage
```

Bootstrap-only escape hatch (static token, first agent before the web app is up):

```txt
POST /v1/admin/agents        header: x-energon-admin-token: <ENERGON_ADMIN_TOKEN>
```

Full request/response examples: [`docs/api.md`](docs/api.md). API keys are
returned once; only peppered SHA-256 hashes are stored.

## Authentication

- **Agents**: `Authorization: Bearer eos_live_...` (hashed keys).
- **Operators**: `Authorization: Bearer <Better Auth JWT>` (EdDSA), verified
  against JWKS at `ENERGON_JWKS_URL`; issuer/audience must match `apps/web`.
- **Dev only**: `x-energon-*` identity headers when `ENERGON_DEV_AUTH=1`.

## Environment variables

Required for the Postgres-backed API: `DATABASE_URL`, `ENERGON_API_KEY_PEPPER`,
`ENERGON_ADMIN_TOKEN`. Web needs `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`,
`DATABASE_URL`, `NEXT_PUBLIC_ENERGON_API_BASE_URL`; the API needs
`ENERGON_JWKS_URL`/`ENERGON_JWT_ISSUER`/`ENERGON_JWT_AUDIENCE` to match the web
app. Embeddings/x402/social-login/rate-limit vars are optional. The complete,
annotated list is in [`.env.example`](.env.example). Without `DATABASE_URL` the
API falls back to in-memory storage (demo only).

## Local development & commands

Standard commands (see `README.md`, `CONTRIBUTING.md`, `package.json`, and
`AGENTS.md` for cloud-specific caveats):

```bash
bun install                       # JS deps
docker compose up -d postgres     # Postgres 17 + pgvector (or a local PG 17)
cargo fmt --all                   # format (CI: --check)
cargo clippy --workspace --all-targets
cargo test --workspace            # Rust tests
bun run api:dev                   # API on :3001 (in-memory unless DATABASE_URL set)
bun run web:dev                   # Next.js dashboard on :3000
bun run web:lint                  # tsc --noEmit
bun run web:build                 # next build
bun run check                     # fmt --check + cargo test + web lint + web build
cargo run -p energon-worker       # optional embedding worker (needs OPENAI_API_KEY)
```

Ports: API `3001` (dev) / `3000` (docker); web `3000`. Migrations run
automatically on API startup (the DB role needs privilege to
`CREATE EXTENSION vector`).

## Operator dashboard

`/dashboard` is the human operator surface (agents use the API directly):

- **Live analytics** (server component, real Postgres aggregates, org-scoped and
  membership-gated): KPI cards, a 14-day activity chart, memory-by-scope,
  permission funnel, recent-activity feed. It updates live via `router.refresh()`
  after mutations. With **no real agent traffic it shows a clean empty state** —
  never demo/seed data.
- **Console**: create org/agent, mint/rotate/revoke API keys, write/promote
  memory, build context, read audits, browse org memory — with toasts and an
  animated "Create API key" action.
- Built with shadcn/ui + Tailwind v4; keep it minimal, black, and `noindex`.

## Database & migrations

`migrations/0001..0007` (identity, memory, audit, scale indexes, promotions,
Better Auth, payments) run automatically on API startup and are idempotent.
Use explicit SQL through sqlx; keep DB access in `energon-db`.

## Security rules

- Never commit `.env`, secrets, tokens, private keys, local data, `node_modules`,
  `.next`, or `target`.
- Do not log bearer tokens. Do not return API-key hashes to clients.
- Do not expose denied memory IDs or content to the requesting agent.
- Keep admin operations behind `ENERGON_ADMIN_TOKEN`; keep audit reads scoped to
  the creating agent/org.
- Use a public receiving address only for x402; never store private keys.
- If you change permission logic, add or update tests.

## Coding style

- Prefer small, direct changes. Keep domain logic in `energon-core`, DB access in
  `energon-db`, HTTP concerns in `energon-api`.
- Use typed Rust structs for contracts; explicit SQL via sqlx.
- Frontend: TypeScript, no unsafe shortcuts; production-ready and type-safe.
- Don't introduce broad abstractions unless they remove real duplication or
  protect an invariant. Update docs when public API, env vars, commands, or
  product behavior changes.

## Testing expectations

Backend:

```bash
cargo fmt --all
cargo test --workspace
```

Frontend:

```bash
bun run web:lint
bun run web:build
```

For permission changes, verify at least: allowed shared memory appears when
relevant; private memory appears only for the owning agent/user path; forbidden
memory is not packed; audit output does not leak forbidden content; promotion
requires an explicit request.

## Definition of done

A change is done when it: preserves the product boundary; preserves
permission-before-retrieval; does not create per-agent copies of shared memory;
does not leak private memory; builds; passes relevant tests; keeps public copy
accurate; and updates docs when behavior changes.

## One-sentence reminder

Energon OS decides what an agent is allowed to know; **Hermes** is the autonomous
agent that uses that memory to run the company and grow it toward **$1M/month**
from agents and users together.
