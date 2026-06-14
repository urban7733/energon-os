# Energon OS Architecture

Energon OS is a memory and context control plane for external AI agents.

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
```

## Core Rule

```txt
Permission filtering happens before ranking, summarization, packing, or delivery.
```

The API resolves the agent identity from a bearer API key. Postgres preselects candidate memories using org/project/role/owner/session constraints. The core permission engine verifies every candidate again before retrieval scoring and token packing.

## Storage Model

Shared memory is stored once. Private memory is stored as an overlay.

```txt
open/org/project/role memory
+ agent_private/user_private/session overlays
= dynamic context pack per agent request
```

## Runtime Components

```txt
energon-api
  Public HTTP API. Authenticates agents, writes memory, builds context, records audit logs.

energon-core
  Pure domain logic. Memory scopes, permission checks, retrieval scoring, context packing.

energon-db
  Explicit sqlx repositories for Postgres identity, memory, chunks, and audits.

energon-worker
  Async indexing worker. Fills pgvector embeddings for memory chunks when OpenAI credentials are configured.
```

## Scale Path

The first scalable version uses Postgres partitionable tables and bounded candidate retrieval:

```txt
ENERGON_RETRIEVAL_CANDIDATE_LIMIT=500
```

This keeps request work bounded while preserving the key security invariant: the core still rejects any memory that fails the permission check.

