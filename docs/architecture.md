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

The API is the primary product surface. Humans may use the dashboard to operate
and inspect the system, but autonomous agents should integrate through the API or
SDKs. The long-term architecture target is massive autonomous usage: fleets of
agents, and eventually billions of agent calls, asking Energon for allowed memory
without Energon becoming their runtime.

Energon is not the system of record for external agent files or raw tool outputs.
An agent may browse the internet, coordinate research, inspect customer systems,
or generate local artifacts elsewhere. Energon only sees what an authenticated
agent writes as memory or asks to retrieve as context.

```txt
External agent runtime
  owns tools, files, browser state, raw notes
  -> writes selected memory to Energon
  -> requests allowed context from Energon

Energon OS
  owns identity, relationships, permissions, memory records, context packs, audits
```

## Core Rule

```txt
Permission filtering happens before ranking, summarization, packing, or delivery.
```

The API resolves the agent identity from a bearer API key. Postgres preselects
candidate memories using org/project/role/owner constraints. The core
permission engine verifies every candidate again before retrieval scoring and
token packing. User and session overlays require a separate signed capability
grant; an agent API key cannot claim them through request parameters.

## Storage Model

Shared memory is stored once. Private memory is stored as an overlay.

```txt
open/org/project/role memory
+ agent_private overlay (agent API today)
+ user_private/session overlays (reserved for signed capability grants)
= dynamic context pack per agent request
```

Promotion is the only path from private to shared memory:

```txt
agent_private -> open/org/project/role
```

Each promotion requires a reason and writes a promotion audit record tied to the
source memory, promoted memory, agent, org, target scope, and timestamp.

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

The scale direction is API-first and agent-native:

```txt
many autonomous agents
  -> authenticated API requests
  -> bounded candidate selection
  -> core permission verification
  -> packed context
  -> audit trail
```

The system should scale by improving identity, storage partitioning, retrieval
indexes, caching, queueing, and SDK ergonomics. It should not scale by absorbing
agent runtime responsibilities into this repository.
