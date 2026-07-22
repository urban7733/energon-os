# Energon OS Architecture

Energon OS is swarm infrastructure: a memory and context control plane for
external AI agents. The SDK is the primary integration surface; the control
plane enforces identity, permissions, persistence, and audits behind it.

```txt
External Agent Runtime
  -> @energon/sdk
  -> Energon Control Plane
  -> Agent Identity
  -> Permission Filter
  -> Candidate Retrieval
  -> Context Broker
  -> Context Packer
  -> Audit Log
  -> Context Pack
```

The TypeScript SDK is the primary product surface. Humans may use the dashboard
to operate and inspect the system, but autonomous runtimes use the SDK. The
long-term architecture target is massive autonomous usage: fleets of agents
asking Energon for allowed memory without Energon becoming their runtime.

Energon is not the system of record for external agent files or raw tool outputs.
An agent may browse the internet, coordinate research, inspect customer systems,
or generate local artifacts elsewhere. Energon only sees what an authenticated
agent writes as memory or asks to retrieve as context.

```txt
External agent runtime
  owns tools, files, browser state, raw notes
  -> @energon/sdk
  -> writes selected memory to the control plane
  -> requests allowed context from the control plane

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
packages/sdk-typescript
  Official server-side SDK. Exposes memory, context, audit, and runtime
  operations without allowing application code to forge agent identity.

energon-api
  Control-plane transport. Authenticates agents, writes memory, builds context,
  records audit logs, and provides the versioned contract used by SDKs.

energon-core
  Pure domain logic. Memory scopes, permission checks, retrieval scoring, context packing.

energon-db
  Explicit sqlx repositories for Postgres identity, memory, chunks, and audits.

energon-worker
  Async indexing worker. Fills pgvector embeddings for memory chunks and publishes
  durable Protobuf control-plane events from the Postgres outbox to JetStream.
```

## Scale Path

The first scalable version uses Postgres partitionable tables and bounded candidate retrieval:

```txt
ENERGON_RETRIEVAL_CANDIDATE_LIMIT=500
```

This keeps request work bounded while preserving the key security invariant: the core still rejects any memory that fails the permission check.

The scale direction is SDK-first and agent-native:

```txt
many autonomous agents
  -> versioned SDK operations
  -> authenticated control-plane requests
  -> bounded candidate selection
  -> core permission verification
  -> packed context
  -> audit trail
```

The system should scale by improving identity, storage partitioning, retrieval
indexes, caching, queueing, and SDK ergonomics. It should not scale by absorbing
agent runtime responsibilities into this repository.

## Durable Events

Every memory write, explicit promotion, context build, claim assertion, and
conflict resolution writes a versioned binary Protobuf envelope to
`event_outbox` inside the same Postgres transaction as the domain mutation. The
worker leases those rows with `SKIP LOCKED`,
publishes them to the `ENERGON_EVENTS` JetStream stream with `Nats-Msg-Id`
deduplication, then records delivery. A failed publish releases the lease with
bounded exponential retry. Operators can inspect only aggregate delivery state
at `GET /v1/orgs/{org_id}/events/outbox`.

## Claims and Conflict Resolution

Free-form memory preserves agent context. Structured claims preserve a single
decision candidate about a subject and predicate. They deliberately use a
different storage path so the system never treats a natural-language note as a
trusted global fact.

```txt
agent assertion: value + evidence + confidence
  -> server derives role authority from swarm_role_policies
  -> score = confidence * authority
  -> PostgreSQL advisory lock for (org, subject, predicate)
  -> accept, supersede, or retain both branches as contested
  -> append hash-linked audit event in the same transaction
```

An incoming claim replaces the accepted fact only when its server-derived score
is at least 10% stronger. Close contradictions remain in `claim_conflicts` for
an authenticated operator to resolve. The accepted and rejected branch states,
the operator identity, reason, timestamp, prior hash, and event hash are
persisted together. This is a transactional single-region conflict policy, not
a claim that the current product is a multi-region CRDT replication system.

CRDT replication, FlatBuffers, gRPC/QUIC, `io_uring`, and shared-memory IPC are
not on the current request path. They should be introduced only after measured
workload data identifies a real bottleneck; at one million daily operations,
the average request rate is roughly 12 per second, where durable Postgres plus
JetStream is the appropriate operational baseline.
