# Energon OS Agent Guide

This file is the operating guide for coding agents working in this repository.

## Mission

Energon OS is the permissioned memory and context layer for AI agent swarms.

It does not run agents. It does not host agents. It does not click browsers, execute workflows, make payments, or become an agent platform. External agents live in other repos and runtimes. They call Energon through an SDK or API.

Energon answers one question:

```txt
Which agent may see which memory for this task?
```

The public claim:

```txt
Energon OS gives every AI agent the right memory, without leaking private memory.
```

## Product Boundary

Build inside this boundary:

- Agent identity
- Memory write/read APIs
- Permission filtering
- Short-term memory
- Long-term memory
- Retrieval over allowed memory
- Context packing
- Explicit memory promotion
- Audit logs
- Admin dashboard for operating the memory layer
- Public website that explains and indexes the product

Do not build these into this repo:

- Agent runtime
- Browser automation
- Workflow execution
- Payment execution
- Tool-use orchestration
- Hosted agent marketplace
- Autonomous company agents

Those may exist later in separate repos. This repo is the memory and context infrastructure.

## Core Invariants

These rules are non-negotiable:

- Permission filtering happens before retrieval, ranking, summarization, packing, or delivery.
- Shared memory is stored once.
- Private memory is an overlay.
- Context is built dynamically per request.
- Private memory never becomes shared memory automatically.
- Promotion from private to shared must be explicit.
- Audit logs must record what memory influenced a context build.
- A denied memory item must not appear in a context pack, logs intended for the agent, or frontend response payloads.

## Context Flow

```txt
External Agent
  -> Energon API
  -> Agent Identity
  -> Permission Filter
  -> Candidate Retrieval
  -> Context Broker
  -> Context Packer
  -> Audit Log
  -> Context Pack
  -> External Agent
```

The important detail: candidate retrieval may be optimized, but permission checks are never optional. Postgres can preselect candidates; Rust core must still verify permissions before packing context.

## Memory Model

```txt
open/org/project/role memory
+ agent_private/user_private/session overlays
= dynamic context pack per agent request
```

Memory scopes:

```txt
open            all allowed agents
org             agents in the same organization
project         agents in the same project
role            agents with the same role
agent_private   one specific agent
user_private    user-approved memory only
session         temporary task/session memory
```

Promotion rule:

```txt
agent_private -> shared
```

Only do this through an explicit promotion path with a reason and audit trail.

## Stack

```txt
Rust 2024        core, API, worker
Tokio            async runtime
Axum             HTTP API
Postgres         metadata, identity, memory, audit
sqlx             explicit SQL access
pgvector         semantic retrieval
Cedar            policy direction
Next.js          landing page and dashboard
TypeScript       frontend
Bun              frontend package/runtime tooling
Docker           local infrastructure only
```

## Repo Map

```txt
crates/energon-core
  Pure domain logic: memory scopes, permission checks, retrieval scoring,
  context brokering, context packing, and audit structs.

crates/energon-api
  Axum API: routes, auth middleware, admin agent creation, memory writes,
  context builds, promotion, audit reads, app state.

crates/energon-db
  Postgres/sqlx repositories: identity, API key hashes, memory rows,
  memory chunks, embeddings, audit records.

crates/energon-worker
  Async worker for embeddings and indexing. Uses OpenAI embeddings when
  OPENAI_API_KEY is configured.

apps/web
  Next.js frontend: black minimal public landing page, LLM/SEO routes,
  private operational dashboard.

migrations
  Postgres schema.

docs
  Architecture, API examples, operations.

policies
  Cedar policy drafts.
```

## Public API

Current endpoints:

```txt
GET  /health
POST /v1/admin/agents
POST /v1/memory/write
POST /v1/context/build
POST /v1/memory/promote
GET  /v1/vault/obsidian.zip
GET  /v1/audit/context/{request_id}
GET  /v1/audit/promotion/{promoted_memory_id}
```

Production agent requests use:

```txt
Authorization: Bearer eos_live_...
```

Admin requests use:

```txt
x-energon-admin-token: <ENERGON_ADMIN_TOKEN>
```

Agent API keys are returned once. Only hashes are stored.

## Environment

Required for production API:

```txt
DATABASE_URL
ENERGON_API_KEY_PEPPER
ENERGON_ADMIN_TOKEN
```

Optional:

```txt
ENERGON_BIND_ADDR=0.0.0.0:3000
ENERGON_DEV_AUTH=false
ENERGON_RETRIEVAL_CANDIDATE_LIMIT=500
OPENAI_API_KEY
ENERGON_EMBEDDING_MODEL=text-embedding-3-small
ENERGON_EMBEDDING_BATCH_SIZE=16
```

The API can run with in-memory storage when `DATABASE_URL` is unset. Treat this as local demo mode only.

## Commands

Backend checks:

```bash
cargo fmt --all
cargo test --workspace
```

Run API:

```bash
cargo run -p energon-api
```

Run worker:

```bash
cargo run -p energon-worker
```

Frontend:

```bash
bun run web:build
bun run web:dev
```

Docker local infra:

```bash
docker compose up --build
docker compose --profile worker up --build
```

## Frontend Rules

The frontend should feel like black, minimal infrastructure for an AI-native company.

Keep:

- Pure black base
- White Energon logo
- Restrained typography
- Thin separators
- Direct product explanation
- LLM-readable public copy
- `/llms.txt`, `/llms-full.txt`, sitemap, robots, metadata, JSON-LD

Avoid:

- Generic SaaS gradients
- Decorative cards everywhere
- Purple/blue AI styling
- Marketing fluff
- Dashboard pages being indexed

The dashboard is operational UI and should stay `noindex`.

## Security Rules

- Never commit `.env`, `.env.local`, secrets, tokens, API keys, private keys, local data, `node_modules`, `.next`, or `target`.
- Do not log bearer tokens.
- Do not return API key hashes to clients.
- Do not expose denied memory IDs or denied memory content to the requesting agent.
- Keep admin operations behind `ENERGON_ADMIN_TOKEN`.
- Keep audit reads scoped to the creating agent/org.
- If changing permission logic, add or update tests.

## Coding Style

- Prefer small, direct changes.
- Keep domain logic in `energon-core`.
- Keep database access in `energon-db`.
- Keep HTTP concerns in `energon-api`.
- Use explicit SQL through sqlx.
- Use typed Rust structs for contracts and domain data.
- Do not introduce broad abstractions unless they remove real duplication or protect an invariant.
- Update docs when public API, env vars, commands, or product behavior changes.

## Testing Expectations

For backend changes:

```bash
cargo fmt --all
cargo test --workspace
```

For frontend changes:

```bash
bun run web:build
```

For permission changes, verify at least:

- allowed shared memory appears when relevant
- private memory appears only for the owning agent/user path
- forbidden memory is not packed
- audit output does not leak forbidden content
- promotion requires an explicit request

## Definition Of Done

A change is done when:

- It preserves the product boundary.
- It preserves permission-before-retrieval behavior.
- It does not create per-agent copies of shared memory.
- It does not leak private memory.
- It builds.
- Relevant tests pass.
- Public copy still describes Energon as permissioned memory infrastructure for agent swarms.
- Docs are updated when behavior changes.

## One-Sentence Reminder

Energon OS is not the agent. Energon OS is the memory layer that decides what the agent is allowed to know.
