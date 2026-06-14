# Energon OS API

Base URL:

```txt
http://127.0.0.1:3000
```

Production agent requests use:

```txt
Authorization: Bearer eos_live_...
```

## Create Agent

Requires:

```txt
x-energon-admin-token: <ENERGON_ADMIN_TOKEN>
```

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

The response includes `api_key` once. Store it immediately.

## Write Memory

```bash
curl -X POST http://127.0.0.1:3000/v1/memory/write \
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
curl -X POST http://127.0.0.1:3000/v1/context/build \
  -H 'content-type: application/json' \
  -H "Authorization: Bearer $ENERGON_AGENT_API_KEY" \
  -d '{
    "task": "prepare investor outreach",
    "project_id": "apex_verify",
    "token_budget": 6000
  }'
```

## Promote Memory

```bash
curl -X POST http://127.0.0.1:3000/v1/memory/promote \
  -H 'content-type: application/json' \
  -H "Authorization: Bearer $ENERGON_AGENT_API_KEY" \
  -d '{
    "memory_id": "mem_...",
    "target_scope": "project",
    "reason": "Approved for shared investor positioning."
  }'
```

## Read Audit

Only the same agent/org that created the context request can read its audit record.

```bash
curl http://127.0.0.1:3000/v1/audit/context/ctx_... \
  -H "Authorization: Bearer $ENERGON_AGENT_API_KEY"
```

