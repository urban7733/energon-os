# Swarm Control Plane

Energon is infrastructure for agent swarms. The product boundary is deliberate:
it provides identity, scoped memory, context, durable decisions, and audit; it
does not run an agent's browser, tools, model loop, or business workflow.

```txt
Agent runtime
  -> @energon/sdk
  -> authenticated control plane
  -> permissioned memory / context / audit

Operator
  -> dashboard
  -> agent identities, role policies, keys, budgets, and investigation
```

## Production Components

The synchronous path must stay small and predictable:

```txt
SDK operation
  -> identity from agent credential
  -> permission filter
  -> bounded retrieval and context packing
  -> Postgres transaction
  -> response with audit reference
```

Postgres is the source of truth. Active context may be cached, but it is never
the only copy of an agent's memory. A cache eviction must not erase an agent's
history or audit trail.

The target asynchronous path will use a transactional outbox, then NATS
JetStream:

```txt
same Postgres transaction
  -> memory / claim / audit mutation
  -> versioned outbox event
  -> JetStream publish with event-id deduplication
  -> embedding, indexing, notification, and reconciliation workers
```

This avoids the dual-write failure where a request commits to Postgres but an
event is lost, or an event is published for a transaction that rolls back.
Protobuf is the event contract for those internal events and for any later gRPC
boundary. JSON remains acceptable at the SDK edge while the public contract is
still stabilizing.

gRPC, QUIC, `io_uring`, FlatBuffers, and shared-memory ring buffers are not
default requirements. They enter a specific hot path only after measured load
tests show a bottleneck that the preceding layer cannot solve. One million
requests per day is about 12 requests per second on average; the system must
be designed for bursts, but it should not be made operationally fragile by
premature transport complexity.

## Conflict Resolution

Free-form memory is not a CRDT. If two agents write contradictory text, a CRDT
can preserve both writes but cannot determine which claim is true. Energon
therefore separates **memory** from structured **claims**.

```txt
memory:  immutable note, evidence, observation, source
claim:   subject + predicate + value + confidence + evidence links
policy:  role authority and validation requirements, set by an operator
decision: accepted / contested / superseded / rejected
```

The control plane, not an agent request, derives role authority. An agent may
submit confidence and evidence, but cannot declare itself the leader or give
itself a higher weight. A deterministic policy score can choose a provisional
winner when evidence is clear. Near-ties, incompatible values, or claims that
need external verification become `contested` instead of silently overwriting
memory.

```txt
new claim
  -> evaluate server-side role policy and confidence
  -> same value: attach supporting evidence
  -> clear policy winner: provisional accepted claim
  -> material conflict: create a claim branch and mark contested
  -> validator or supervisor with an assigned policy resolves the branch
  -> append every transition to the audit chain
```

State for counters, membership sets, cursors, and presence can use a suitable
CRDT later. Semantic facts and decisions use the claims workflow above.

## Audit Integrity

The planned decision chain makes each event immutable and records its actor,
policy version, evidence references, timestamp, prior event hash, and its own
cryptographic hash. The chain will be scoped per swarm and written in the same
transaction as the decision. It is an audit mechanism, not a substitute for
backups or access control.

## Delivery Order

1. SDKs and the stable control-plane contract.
2. Transactional outbox, Protobuf event schema, and NATS JetStream workers.
3. Structured claims, operator-owned role policy, conflict branches, and
   append-only audit chain.
4. Load tests with real latency and failure targets.
5. Only then adopt gRPC, QUIC, zero-copy encoding, or node-local IPC where
   measurements justify their operational cost.
