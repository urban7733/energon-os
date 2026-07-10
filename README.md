# Energon OS

Energon OS is the permissioned memory and context layer for AI agent swarms.

It does not run agents, click browsers, execute workflows, make payments, or host agent runtimes. Agents live in other systems. Energon decides what memory each agent is allowed to see for a specific task, retrieves only permitted context, packs it into a token budget, and records an audit trail.

> Energon OS gives every AI agent the right memory, without leaking private memory.

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

The first crypto payment boundary in this repo is an x402 API gate. When enabled,
paid agent routes return `402 Payment Required` with payment instructions before
memory or context is delivered. Real wallet custody, private keys, treasury
automation, accounting, and broader payment orchestration stay outside this
memory core.

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
React/Bun dashboard later
```

Current repository state:

```txt
crates/energon-core   pure domain logic for memory, permissions, retrieval, packing
crates/energon-api    Axum API with dev identity headers and pluggable storage
crates/energon-db     Postgres/sqlx repositories for identity, memory, and audit
crates/energon-worker async worker placeholder for embeddings and documents
migrations/           Postgres schema for identity, memory, chunks, and audit
policies/             Cedar policy starting point
```

## Production API

Endpoints:

```txt
GET  /health
POST /v1/admin/agents
GET  /v1/billing/x402
POST /v1/memory/write
POST /v1/context/build
POST /v1/memory/promote
GET  /v1/vault/obsidian.zip
GET  /v1/audit/context/{request_id}
GET  /v1/audit/promotion/{promoted_memory_id}
```

Production agent requests use bearer API keys:

```txt
Authorization: Bearer eos_live_...
```

Admin creates agents and receives the API key once:

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
cargo test --workspace
```

## Documentation

```txt
docs/architecture.md
docs/api.md
docs/crypto-payments.md
docs/operations.md
```

## Remaining Production Work

The first scalable code path is implemented. Before a real public launch, the non-code production work is:

1. Run migrations on the production database.
2. Deploy API and worker with real secrets.
3. Configure backups, monitoring, logs, and rate limits.
4. Run load tests against realistic memory volume.
5. Generate public SDKs from the stabilized API.
