# Energon OS Operations

## Required Production Environment

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

## API

Run:

```bash
energon-api
```

The API refuses Postgres-backed startup unless `ENERGON_API_KEY_PEPPER` is configured.

## Worker

Run:

```bash
energon-worker
```

The worker requires:

```txt
DATABASE_URL
OPENAI_API_KEY
```

One-shot mode:

```bash
ENERGON_WORKER_ONCE=1 energon-worker
```

## Local Docker

With a Docker Compose plugin:

```bash
docker compose up --build
```

Run worker profile:

```bash
docker compose --profile worker up --build
```

## Security Invariants

```txt
1. API keys are returned once and only hashes are stored.
2. Agent identity is resolved before memory retrieval.
3. Postgres selects candidates, then Rust verifies permissions again.
4. Audit records are visible only to the creating agent/org.
5. Private memory is never promoted automatically.
```

