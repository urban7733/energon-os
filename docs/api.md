# Energon OS Control-Plane Contract

Application code should use `@energon/sdk`. This document defines the
versioned HTTP contract used by the SDK and self-hosted deployments.

Base URL:

```txt
http://127.0.0.1:3001
```

Two authentication surfaces:

```txt
Agents      Authorization: Bearer eos_live_...          (hashed API keys)
Operators   Authorization: Bearer <Better Auth JWT>     (EdDSA, verified via JWKS)
```

Operator JWTs are minted by the web app (`GET /api/auth/token` on the Next.js
origin) and verified by the Rust API against `ENERGON_JWKS_URL`. The JWT
carries the active organization in the `org` claim; management routes reject
any request whose `org` claim does not equal the `{org_id}` path parameter.

When x402 is enabled, paid agent routes also require an x402 payment payload:

```txt
PAYMENT-SIGNATURE: <x402 payment payload>
```

Without payment, the API responds with `402 Payment Required` and a
`PAYMENT-REQUIRED` header containing the accepted payment requirements.

All routes are rate limited per API key (or client IP) with a token bucket
(default 20 rps, burst 40). Exhausted buckets receive `429 Too Many Requests`.
Request bodies are limited to 1 MiB by default.

## Swarm Runtime Handshake

The SDK calls this endpoint to verify the authenticated agent's effective swarm
identity and the guarantees active on this control-plane version. The response
does not accept caller-supplied identity fields.

```bash
curl http://127.0.0.1:3001/v1/swarm/runtime \
  -H "Authorization: Bearer $ENERGON_AGENT_API_KEY"
```

## Event Delivery Status

Operators can inspect durable event delivery without receiving event payloads or
memory content:

```bash
curl http://127.0.0.1:3001/v1/orgs/$ORG_ID/events/outbox \
  -H "Authorization: Bearer $OPERATOR_JWT"
```

The response reports `pending`, `leased`, `published`, and `retrying` rows for
the active organization. JetStream is configured through `ENERGON_NATS_URL` on
the worker; API requests do not block on event publishing.

```json
{
  "contract_version": "v1",
  "swarm_id": "org_...",
  "agent": {
    "agent_id": "agent_...",
    "role_id": "research",
    "project_id": "project_..."
  },
  "guarantees": {
    "permission_filter_before_retrieval": true,
    "private_memory_by_default": true,
    "explicit_shared_promotion": true,
    "context_audit": true
  }
}
```

## x402 Billing Status

```bash
curl http://127.0.0.1:3001/v1/billing/x402
```

Relevant environment variables:

```txt
ENERGON_X402_ENABLED=true
ENERGON_X402_PAY_TO=0xYourReceivingAddress
ENERGON_X402_NETWORK=eip155:84532
ENERGON_X402_ASSET=0x036CbD53842c5426634e7929541eC2318f3dCF7e
ENERGON_X402_FACILITATOR_URL=https://x402.org/facilitator
ENERGON_X402_FACILITATOR_BEARER=<optional facilitator bearer token>
```

Paid routes (defaults; override with `ENERGON_PRICE_*_MICRO` env vars):

```txt
POST /v1/memory/write                    $0.001 USDC   (ENERGON_PRICE_MEMORY_WRITE_MICRO=1000)
POST /v1/memory/promote                  $0.001 USDC   (ENERGON_PRICE_MEMORY_PROMOTE_MICRO=1000)
POST /v1/context/build                   $0.003 USDC   (ENERGON_PRICE_CONTEXT_BUILD_MICRO=3000)
POST /v1/claims/assert                   $0.001 USDC   (ENERGON_PRICE_CLAIM_ASSERT_MICRO=1000)
GET  /v1/audit/context/{request_id}      $0.0005 USDC  (ENERGON_PRICE_AUDIT_READ_MICRO=500)
GET  /v1/audit/promotion/{memory_id}     $0.0005 USDC  (ENERGON_PRICE_AUDIT_READ_MICRO=500)
GET  /v1/vault/obsidian.zip              $0.005 USDC   (ENERGON_PRICE_VAULT_EXPORT_MICRO=5000)
```

Settled payments are persisted to `payment_receipts` (tx hash, payer, raw
facilitator response) and every paid-route call records a `usage_events` row.
See `GET /v1/orgs/{org_id}/usage` below.

For local UI testing only, `ENERGON_X402_ACCEPT_UNVERIFIED=1` accepts a non-empty
`PAYMENT-SIGNATURE` without facilitator verification. Do not use that in
production.

## Human Plan Billing (Operator JWT)

Human operators can pay the active organization plan in USDC on Base. This
flow requires Postgres, `ENERGON_X402_PAY_TO`, and `ENERGON_BASE_RPC_URL`.
There are no stored wallet keys and no automatic renewal.

```bash
curl http://127.0.0.1:3001/v1/orgs/$ORG_ID/billing \
  -H "Authorization: Bearer $OPERATOR_JWT"
```

Create a 15-minute checkout intent for `developer` (99 USDC, 100k operations)
or `team` (499 USDC, 1M operations):

```bash
curl -X POST http://127.0.0.1:3001/v1/orgs/$ORG_ID/billing/checkout \
  -H 'content-type: application/json' \
  -H "Authorization: Bearer $OPERATOR_JWT" \
  -d '{"plan_id":"developer"}'
```

The response provides the Base chain, canonical USDC contract, receiving
address, price in micro-USDC, and intent id. The dashboard transfers USDC,
waits for a confirmation, signs the checkout message with the same payer
wallet, then calls `POST /v1/orgs/{org_id}/billing/complete`. The API checks
the ERC-20 `Transfer` event and the signer before unlocking the organization
for 30 days.

## Organization Management (Operator JWT)

All management routes require `Authorization: Bearer <Better Auth JWT>` whose
`org` claim equals `{org_id}`. A mismatch returns `403`; a JWT without an
active organization returns `403`.

### Create Agent + API Key

```bash
curl -X POST http://127.0.0.1:3001/v1/orgs/$ORG_ID/agents \
  -H 'content-type: application/json' \
  -H "Authorization: Bearer $OPERATOR_JWT" \
  -d '{
    "agent_id": "agent_777",
    "role_id": "strategist",
    "project_id": "apex_verify",
    "name": "Apex Verify Strategist"
  }'
```

The response includes `api_key` exactly once; only the peppered SHA-256 hash is
stored. The org row is created on first use, linking the Better Auth
organization id to the Energon `orgs` table.

### List Agents (key metadata, never hashes)

```bash
curl http://127.0.0.1:3001/v1/orgs/$ORG_ID/agents \
  -H "Authorization: Bearer $OPERATOR_JWT"
```

### Rotate an Agent Key

Mints a new key for the agent. The old key stays valid until revoked so agents
can switch over without downtime.

```bash
curl -X POST http://127.0.0.1:3001/v1/orgs/$ORG_ID/agents/agent_777/keys \
  -H "Authorization: Bearer $OPERATOR_JWT"
```

### Revoke an API Key

```bash
curl -X DELETE http://127.0.0.1:3001/v1/orgs/$ORG_ID/keys/key_... \
  -H "Authorization: Bearer $OPERATOR_JWT"
```

### List Org Memories

Metadata plus a truncated content preview. Optional `scope`, `limit` (max 200),
`offset`.

```bash
curl "http://127.0.0.1:3001/v1/orgs/$ORG_ID/memories?scope=org&limit=50&offset=0" \
  -H "Authorization: Bearer $OPERATOR_JWT"
```

### Memory Scope Counts

Returns exact organization-wide counts by memory scope for the operator
dashboard. It does not expose memory content.

```bash
curl http://127.0.0.1:3001/v1/orgs/$ORG_ID/memory-stats \
  -H "Authorization: Bearer $OPERATOR_JWT"
```

### Delete a Memory

Deletes the memory and its chunks (cascade).

```bash
curl -X DELETE http://127.0.0.1:3001/v1/orgs/$ORG_ID/memories/mem_... \
  -H "Authorization: Bearer $OPERATOR_JWT"
```

### Usage & Payments Summary

Per-route call counts, paid counts, settled USDC totals, and recent receipts.

```bash
curl http://127.0.0.1:3001/v1/orgs/$ORG_ID/usage \
  -H "Authorization: Bearer $OPERATOR_JWT"
```

### Role Authority Policy

Authority belongs to the organization policy, not the calling agent. The API
uses it together with agent-provided confidence to score an assertion.

```bash
curl -X PUT http://127.0.0.1:3001/v1/orgs/$ORG_ID/role-policies/researcher \
  -H 'content-type: application/json' \
  -H "Authorization: Bearer $OPERATOR_JWT" \
  -d '{"authority_bps":8500,"can_resolve_conflicts":false}'
```

List explicit policies:

```bash
curl http://127.0.0.1:3001/v1/orgs/$ORG_ID/role-policies \
  -H "Authorization: Bearer $OPERATOR_JWT"
```

### Inspect and Resolve Claim Conflicts

Only genuine competing assertions for the same `(subject, predicate)` create a
conflict branch. An operator accepts exactly one existing branch and supplies a
reason; this is written to the immutable audit hash chain in the same
transaction.

```bash
curl "http://127.0.0.1:3001/v1/orgs/$ORG_ID/conflicts?include_resolved=true" \
  -H "Authorization: Bearer $OPERATOR_JWT"

curl -X POST http://127.0.0.1:3001/v1/orgs/$ORG_ID/conflicts/conflict_.../resolve \
  -H 'content-type: application/json' \
  -H "Authorization: Bearer $OPERATOR_JWT" \
  -d '{"accepted_claim_id":"claim_...","reason":"Verified against the source system."}'
```

## Create Agent (bootstrap only)

`POST /v1/admin/agents` with the static `ENERGON_ADMIN_TOKEN` header is kept
ONLY as a bootstrap escape hatch (e.g. minting the first agent before the web
app is running). Use the JWT-authenticated org routes for everything else.

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

The response includes `api_key` once. Store it immediately.

## Write Memory

```bash
curl -X POST http://127.0.0.1:3001/v1/memory/write \
  -H 'content-type: application/json' \
  -H "Authorization: Bearer $ENERGON_AGENT_API_KEY" \
  -d '{
    "scope": "agent_private",
    "content": "Do not position Apex Verify as just another social app.",
    "tags": ["positioning", "investor"]
  }'
```

## Assert a Structured Claim

Claims are distinct from free-form memory. The agent supplies a structured
value, a confidence score, and optional supporting memory IDs. It cannot set
its own authority. When a conflicting accepted claim is too close to replace
automatically, the API returns `resolution: "contested"` and creates a branch
for the operator dashboard.

```bash
curl -X POST http://127.0.0.1:3001/v1/claims/assert \
  -H 'content-type: application/json' \
  -H "Authorization: Bearer $ENERGON_AGENT_API_KEY" \
  -H "PAYMENT-SIGNATURE: $X402_PAYMENT" \
  -d '{
    "subject":"vendor:acme",
    "predicate":"security_status",
    "value":{"status":"review_required"},
    "confidence_bps":8700,
    "evidence_memory_ids":["mem_..."]
  }'
```

## Build Context

```bash
curl -X POST http://127.0.0.1:3001/v1/context/build \
  -H 'content-type: application/json' \
  -H "Authorization: Bearer $ENERGON_AGENT_API_KEY" \
  -d '{
    "task": "prepare investor outreach",
    "project_id": "apex_verify",
    "token_budget": 6000
  }'
```

Retrieval: when `OPENAI_API_KEY` is set on the API, the task is embedded
(text-embedding-3-small) and candidates are selected by pgvector cosine
distance — with the permission filter applied inside SQL, before any ranking.
Memories whose chunks have not been embedded yet are unioned in by recency so
they stay reachable. If embedding is not configured or the embedding call
fails, the API logs a warning and falls back to recency + keyword retrieval;
an embedding failure never fails the request.

## Promote Memory

Only `agent_private` memory can be promoted. The target scope must be one of
`open`, `org`, `project`, or `role`, and `reason` is required for the promotion
audit trail.

```bash
curl -X POST http://127.0.0.1:3001/v1/memory/promote \
  -H 'content-type: application/json' \
  -H "Authorization: Bearer $ENERGON_AGENT_API_KEY" \
  -d '{
    "memory_id": "mem_...",
    "target_scope": "project",
    "reason": "Approved for shared investor positioning."
  }'
```

## Read Context Audit

Only the same agent/org that created the context request can read its audit record.

```bash
curl http://127.0.0.1:3001/v1/audit/context/ctx_... \
  -H "Authorization: Bearer $ENERGON_AGENT_API_KEY"
```

## Read Promotion Audit

Only the same agent/org that created the promotion can read its promotion audit
record.

```bash
curl http://127.0.0.1:3001/v1/audit/promotion/mem_... \
  -H "Authorization: Bearer $ENERGON_AGENT_API_KEY"
```

## Export Obsidian Vault

Exports a real Obsidian-compatible ZIP vault for the authenticated agent. The
vault contains Markdown notes with YAML frontmatter and `[[wikilinks]]` for
agents, organizations, projects, roles, sessions, memory records, context builds,
and memory promotions.

The export is permission-filtered. It only includes memory visible to the
calling identity and an optional `project_id` filter. `user_id` and
`session_id` need a signed capability grant and are rejected on agent API-key
requests.

```bash
curl "http://127.0.0.1:3001/v1/vault/obsidian.zip?project_id=apex_verify&limit=500" \
  -H "Authorization: Bearer $ENERGON_AGENT_API_KEY" \
  -o energon-obsidian-vault.zip
```

Open the extracted folder in Obsidian to use the native graph view.
