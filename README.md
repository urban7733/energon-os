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
POST /v1/memory/write
POST /v1/context/build
POST /v1/memory/promote
GET  /v1/audit/context/{request_id}
```

Production agent requests use bearer API keys:

```txt
Authorization: Bearer eos_live_...
```

Admin creates agents and receives the API key once:

```bash
curl -X POST http://127.0.0.1:3000/v1/admin/agents \
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
docs/operations.md
```

## Remaining Production Work

The first scalable code path is implemented. Before a real public launch, the non-code production work is:

1. Run migrations on the production database.
2. Deploy API and worker with real secrets.
3. Configure backups, monitoring, logs, and rate limits.
4. Run load tests against realistic memory volume.
5. Generate public SDKs from the stabilized API.
