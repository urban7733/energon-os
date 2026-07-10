# Energon OS API

Base URL:

```txt
http://127.0.0.1:3001
```

Production agent requests use:

```txt
Authorization: Bearer eos_live_...
```

When x402 is enabled, paid routes also require an x402 payment payload:

```txt
PAYMENT-SIGNATURE: <x402 payment payload>
```

Without payment, the API responds with `402 Payment Required` and a
`PAYMENT-REQUIRED` header containing the accepted payment requirements.

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

Paid routes:

```txt
POST /v1/memory/write                    $0.001 USDC
POST /v1/memory/promote                  $0.001 USDC
POST /v1/context/build                   $0.003 USDC
GET  /v1/audit/context/{request_id}      $0.0005 USDC
GET  /v1/audit/promotion/{memory_id}     $0.0005 USDC
GET  /v1/vault/obsidian.zip              $0.005 USDC
```

For local UI testing only, `ENERGON_X402_ACCEPT_UNVERIFIED=1` accepts a non-empty
`PAYMENT-SIGNATURE` without facilitator verification. Do not use that in
production.

## Create Agent

Requires:

```txt
x-energon-admin-token: <ENERGON_ADMIN_TOKEN>
```

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
calling identity and optional `project_id`, `user_id`, and `session_id` filters.

```bash
curl "http://127.0.0.1:3001/v1/vault/obsidian.zip?project_id=apex_verify&limit=500" \
  -H "Authorization: Bearer $ENERGON_AGENT_API_KEY" \
  -o energon-obsidian-vault.zip
```

Open the extracted folder in Obsidian to use the native graph view.
