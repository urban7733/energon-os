# Energon OS

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Rust](https://img.shields.io/badge/rust-2024-orange.svg)](https://www.rust-lang.org/)

**The memory OS for AI agents.** Open source core. Hosted API for production.

Energon OS is the permissioned memory and context layer for AI agent swarms. Connect one agent or a distributed swarm — developers control scopes, token budgets, and which agent gets more memory than another.

It does not run agents, click browsers, execute workflows, make payments, or host agent runtimes. Agents live in other systems. Energon decides what memory each agent is allowed to see for a specific task, retrieves only permitted context, packs it into a token budget, and records an audit trail.

> Energon OS gives every AI agent the right memory, without leaking private memory.

## Links

- Website: [energon.os](https://energon.os)
- API docs: [docs/api.md](docs/api.md)
- Deployment: [docs/deployment.md](docs/deployment.md)
- LLM context: [/llms.txt](https://energon.os/llms.txt)
- Contributing: [CONTRIBUTING.md](CONTRIBUTING.md)
- Security: [SECURITY.md](SECURITY.md)

## Quick Start

```bash
bun install
cargo test --workspace
docker compose up -d postgres        # Postgres 17 + pgvector
export DATABASE_URL=postgres://energon:energon@localhost:5432/energon
export ENERGON_API_KEY_PEPPER=$(openssl rand -hex 32)
export BETTER_AUTH_SECRET=$(openssl rand -base64 32)
export ENERGON_JWKS_URL=http://localhost:3000/api/auth/jwks
bun run api:dev
bun run web:dev
```

Open `http://localhost:3000/login`, create an account and an organization, then
operate agents, keys, memories, and usage from
`http://localhost:3000/dashboard`. Without `DATABASE_URL` the API falls back to
in-memory storage and dev identity headers for fast demos only.

## Repository Map

```txt
crates/energon-core    pure domain logic: memory, scopes, permissions, context, audit
crates/energon-api     Axum API: auth, memory writes, context builds, audits, x402, vault export
crates/energon-db      sqlx repositories for Postgres, pgvector, identity, memory, audit
crates/energon-worker  embedding worker for pending memory chunks
apps/web               Next.js landing page, Better Auth accounts/orgs, operator dashboard
docs/                  API, architecture, deployment, operations, crypto payments
policies/              Cedar policy starting point
migrations/            Postgres schema and scale indexes
```

## Open Source Model

This repository is the **open source core**:

```txt
Open source     permission engine, API, scopes, audit format, self-host path
Commercial      hosted API, operator dashboard, enterprise tenancy, SLA
```

You can self-host the memory layer for free under Apache 2.0. Production hosting, managed operations, and enterprise features are offered separately at [energon.os](https://energon.os).

Why open source the core:

```txt
Developers need to trust permission boundaries before sending agent memory.
Private overlays, scope rules, and audit trails should be inspectable.
The moat is reliable operation at scale — not hidden permission logic.
```

## Product Boundary

```txt
We provide     scoped memory, permission filters, context packs, audit logs
You control    agent count, scopes, budgets, promotion rules
We never       run agents, orchestrate workflows, or decide what agents build
```

## Mission

AI-native companies will operate with fleets of agents. Those agents need shared knowledge, private overlays, short-term task memory, long-term institutional memory, and proof of what context influenced an output.

Energon OS exists to make this safe:

```txt
Agents should share knowledge.
Agents should not leak secrets.
Every context decision should be permissioned and auditable.
```

The product category is:

```txt
Permissioned memory infrastructure for agent swarms.
```

## Long-Term Company Goal

The broader goal is a complete autonomous AI-native company: a company operated by
specialized AI agents that can plan, coordinate, execute work, use tools, and
compound institutional memory over time.

Energon OS is the memory and context infrastructure for that larger system. It is
not the autonomous company runtime. Agent execution, browser automation,
workflow orchestration, payments, marketplaces, and company-operating agents
belong in separate repositories and services. Those systems should call Energon
through an API or SDK when they need permissioned memory and auditable context.

The long-term autonomous-company roadmap includes crypto payments so agents can
pay, settle, and purchase services autonomously. That payment execution layer
should be built as a separate service or repository. Energon should integrate
with it through clean APIs when payment-aware agents need memory, identity,
permissions, or audit context.

This repository has two crypto payment boundaries. The x402 API gate lets agents
pay per paid request; when enabled it returns `402 Payment Required` before
memory or context is delivered. The operator dashboard also supports a direct
Base-USDC purchase that unlocks an organization for 30 days after the API
verifies the transfer. Real wallet custody, private keys, treasury automation,
accounting, and recurring-debit orchestration stay outside this memory core.

## API-First Product Model

The primary users of Energon OS are agents, not humans clicking through a UI.
The dashboard is an operator surface for setup, inspection, and audits. The core
product surface is the API and future SDKs that autonomous agents call directly.

The long-term scale goal is that billions of external agents can use Energon as
their permissioned memory layer. Every design decision should preserve that
shape:

```txt
Autonomous agents
  -> Energon API/SDK
  -> permissioned memory and context
  -> audited context pack
  -> autonomous agents
```

At that scale, the product must remain narrow and reliable: identify the agent,
filter permissions before retrieval, return only allowed context, and record what
influenced the output.

## External Agent Data Boundary

Energon OS does not own or manage the external agents' files, browsers, local
working directories, raw tool outputs, or private runtime state. Those belong to
the agent platforms, customer systems, or separate autonomous-company repos.

For example, one group of agents might search the public internet for information
about a person, another might verify sources, and another might coordinate a
report. Their crawling, browsing, files, and raw notes stay outside Energon unless
an agent explicitly writes selected memory through the API.

Energon stores and controls:

```txt
agent identity
organization/project/role/session relationships
permissioned memory records
private overlays
shared context
promotion audit trails
context build audit trails
optional source references or metadata
```

This keeps the product boundary clean: external agents do the work; Energon
decides what memory they may share or receive for that work.

## Business Logic

The central question Energon answers is:

```txt
Which agent is allowed to see which memory for this task?
```

The business logic is intentionally narrow:

1. Identify the calling agent.
2. Resolve org, project, role, and private ownership.
3. Filter memory by permissions before ranking or packing.
4. Retrieve relevant short-term and long-term memory.
5. Build a compact context pack under a token budget.
6. Return the context pack to the external agent.
7. Log exactly which memory influenced the request.

The core memory model:

```txt
Shared memory is stored once.
Private memory is an overlay.
Context is built dynamically per agent.
```

Supported memory scopes:

```txt
open          all allowed agents in an org
org           all agents in the same org
project       agents assigned to the same project
role          agents with a matching role
agent_private one specific agent
user_private  one user-approved context path
session       one temporary task/session
```

The schema reserves all seven scopes, but the current agent API only accepts
direct `agent_private` writes. An agent must explicitly promote its own memory
to `open`, `org`, `project`, or `role`, with an audit reason. `user_private`
and `session` access require a separately signed capability grant and are not
accepted from a bearer API-key request yet.

Private memory never flows back into shared memory automatically. Promotion must be explicit:

```txt
agent_private -> shared
```

Promotion requires a non-empty reason and records a promotion audit entry.

Commercially, Energon can be sold as:

```txt
Developer Cloud      hosted API for agent builders
Team/Startup Plan    shared memory and audit for AI-native teams
Enterprise Pilot     permissioned memory, private overlays, compliance audit
Self-hosted Core     infra teams running their own agent memory layer
```

## Tech Stack

Core stack:

```txt
Rust 2024
Tokio async runtime
Axum HTTP API
PostgreSQL 17
pgvector for semantic retrieval
sqlx for explicit SQL access
Cedar policies for authorization rules
Cloudflare R2 / MinIO for large document storage
OpenAI embeddings behind a provider interface
TypeScript and Python SDKs later
Next.js/Bun landing page and operator dashboard
```

Current repository state:

```txt
crates/energon-core   pure domain logic for memory, permissions, retrieval, packing
crates/energon-api    Axum API with dev identity headers and pluggable storage
crates/energon-db     Postgres/sqlx repositories for identity, memory, and audit
crates/energon-worker async worker for OpenAI embeddings into pgvector chunks
migrations/           Postgres schema for identity, memory, chunks, and audit
policies/             Cedar policy starting point
apps/web              Next.js site + Better Auth (email/password + optional GitHub, orgs, JWT/JWKS)
```

## Production API

Agent endpoints (bearer `eos_live_...` API keys):

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

Operator management endpoints (Better Auth JWT, org-scoped — the JWT `org`
claim must match `{org_id}` or the API returns 403):

```txt
POST   /v1/orgs/{org_id}/agents
GET    /v1/orgs/{org_id}/agents
POST   /v1/orgs/{org_id}/agents/{agent_id}/keys
DELETE /v1/orgs/{org_id}/keys/{api_key_id}
GET    /v1/orgs/{org_id}/memories?scope=&limit=&offset=
GET    /v1/orgs/{org_id}/memory-stats
DELETE /v1/orgs/{org_id}/memories/{memory_id}
GET    /v1/orgs/{org_id}/usage
GET    /v1/orgs/{org_id}/billing
POST   /v1/orgs/{org_id}/billing/checkout
POST   /v1/orgs/{org_id}/billing/complete
```

Humans sign in through the web app with Better Auth email/password, or optional
GitHub login when its credentials are configured (see `.env.example`). Users
create an organization and manage agents and API keys from the dashboard. The
dashboard mints short-lived EdDSA JWTs which the Rust API verifies against the
Better Auth JWKS endpoint (`ENERGON_JWKS_URL`).

All paid usage is crypto-only: agents pay per request through x402, and human
operators can buy a 30-day organization plan in USDC on Base. The server
verifies the USDC ERC-20 transfer and wallet signature before it unlocks the
plan's included operations. There is no fiat payment path anywhere in the
platform.

`POST /v1/admin/agents` with `x-energon-admin-token` still exists but is a
BOOTSTRAP-ONLY escape hatch (e.g. first agent before the web app is up):

```bash
curl -X POST http://127.0.0.1:3001/v1/admin/agents \
  -H 'content-type: application/json' \
  -H "x-energon-admin-token: $ENERGON_ADMIN_TOKEN" \
  -d '{
    "agent_id": "agent_777",
    "org_id": "org_1",
    "role_id": "strategist",
    "project_id": "apex_verify",
    "name": "Apex Verify Strategist"
  }'
```

Full API examples are in [docs/api.md](docs/api.md).

## Obsidian Vault Export

Humans can inspect agent memory as a real Obsidian-compatible vault. The API
exports permission-filtered Markdown notes for agents, organizations, projects,
roles, sessions, memories, context builds, and promotions. Notes use YAML
frontmatter and Obsidian `[[wikilinks]]`, so Obsidian's graph view shows who
wrote what, where it belongs, which context builds used it, and how private
memory was promoted.

The vault is a read-only human view. Energon OS remains the source of truth for
permissions, Postgres storage, pgvector retrieval, and audit logs. The export
must never bypass identity or permission filtering.

## Local Development

By default, the API runs with in-memory storage if `DATABASE_URL` is not set. This is for fast local demos only. Set `DATABASE_URL` for the scalable Postgres-backed path.

Start infrastructure:

```bash
docker compose up -d
```

Run the API:

```bash
export DATABASE_URL=postgres://energon:energon@localhost:5432/energon
export ENERGON_API_KEY_PEPPER=$(openssl rand -hex 32)
export ENERGON_ADMIN_TOKEN=$(openssl rand -hex 32)
cargo run -p energon-api
```

For a fast in-memory local dashboard demo, run the API on port 3001:

```bash
bun run api:dev
```

Enable x402 payment challenges for paid API routes:

```bash
export ENERGON_X402_ENABLED=true
export ENERGON_X402_PAY_TO=0xYourReceivingAddress
export ENERGON_X402_NETWORK=eip155:84532
export ENERGON_X402_ASSET=0x036CbD53842c5426634e7929541eC2318f3dCF7e
export ENERGON_X402_FACILITATOR_URL=https://x402.org/facilitator
```

Use a public receiving address only. Never put a private key, seed phrase, or
wallet backup into the repository or dashboard. For local UI testing without an
onchain settlement, `ENERGON_X402_ACCEPT_UNVERIFIED=1` can bypass facilitator
verification; do not use that flag in production.

Run the embedding worker:

```bash
export OPENAI_API_KEY=...
cargo run -p energon-worker
```

Run checks:

```bash
cargo fmt --all
cargo clippy --workspace --all-targets
cargo test --workspace
bun run web:lint
bun run web:build
```

The web app requires a Node/Bun server runtime (`bun run web:start` after
`bun run web:build`) because Better Auth API routes and server-side session
checks cannot be statically exported. The previous Cloudflare Pages static
deploy was removed for that reason — deploy `apps/web` to any Node-compatible
host (or a container) instead.

## Documentation

```txt
docs/architecture.md
docs/api.md
docs/crypto-payments.md
docs/deployment.md
docs/operations.md
CONTRIBUTING.md
SECURITY.md
```

## License

Apache License 2.0. See [LICENSE](LICENSE).

## Remaining Production Work

The first scalable code path is implemented. Migrations now run automatically
on API startup, and rate limiting, CORS, and body limits are built in. Before a
real public launch, the remaining non-code production work is:

1. Deploy API, worker, and web app with real secrets.
2. Configure backups, monitoring, and log aggregation.
3. Run load tests against realistic memory volume.
4. Generate public SDKs from the stabilized API.
5. Configure a production Base RPC provider, receiving wallet and mainnet USDC
   variables before enabling real payments (see docs/crypto-payments.md).
