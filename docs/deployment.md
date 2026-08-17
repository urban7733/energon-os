# Railway Deployment

Energon OS needs five Railway services in one project:

```txt
web       Next.js + Better Auth + dashboard
api       Rust/Axum API
worker    Rust embedding worker
postgres  pgvector PostgreSQL
nats      NATS with JetStream enabled
```

Cloudflare can still provide DNS, TLS and WAF in front of the Railway domains.
Cloudflare Pages is not suitable for this web app because Better Auth uses
server routes and sessions.

## 1. Postgres

Create Railway's `pgvector` Postgres template. Reference its private
`DATABASE_URL` from the `api`, `worker`, and `web` services. The API runs the
repository migrations automatically at startup.

Create a private NATS service with JetStream enabled (`nats-server -js`). Do
not expose it publicly. Give the worker its private connection URL:

```txt
ENERGON_NATS_URL=nats://<private-nats-host>:4222
ENERGON_EVENT_OUTBOX_BATCH_SIZE=100
```

## 2. API

Create a service from this repository using the root `Dockerfile`. Generate a
public domain such as `api.energon.os` and set:

```txt
DATABASE_URL=${{Postgres.DATABASE_URL}}
ENERGON_ENV=production
# Railway provides PORT automatically; the API uses it when ENERGON_BIND_ADDR is unset.
ENERGON_API_KEY_PEPPER=<openssl rand -hex 32>
ENERGON_ADMIN_TOKEN=<openssl rand -hex 32>
ENERGON_JWKS_URL=https://energon.os/api/auth/jwks
ENERGON_JWT_ISSUER=https://energon.os
ENERGON_JWT_AUDIENCE=energon-api
ENERGON_WEB_ORIGIN=https://energon.os
OPENAI_API_KEY=<OpenAI key>
```

Do not set `ENERGON_DEV_AUTH` in production.

## 3. Worker

Create another service from the same root `Dockerfile` and set:

```txt
ENERGON_PROCESS=energon-worker
```

Set `DATABASE_URL`, `OPENAI_API_KEY` (optional when only publishing events),
`ENERGON_EMBEDDING_MODEL`, `ENERGON_EMBEDDING_BATCH_SIZE`,
`ENERGON_NATS_URL`, and `ENERGON_EVENT_OUTBOX_BATCH_SIZE`. The worker needs no
public domain.

## 4. Web

Create a service using Dockerfile path `apps/web/Dockerfile` and generate the
public domain `energon.os`. Set:

```txt
DATABASE_URL=${{Postgres.DATABASE_URL}}
BETTER_AUTH_SECRET=<openssl rand -base64 32>
BETTER_AUTH_URL=https://energon.os
NEXT_PUBLIC_SITE_URL=https://energon.os
NEXT_PUBLIC_ENERGON_API_BASE_URL=https://api.energon.os
```

### GitHub login

Create a GitHub OAuth application and set these values only in Railway, never
in Git:

```txt
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
```

Use this redirect URL:

```txt
https://energon.os/api/auth/callback/github
```

## Human USDC Plans

The dashboard lets an authenticated operator pay Developer (99 USDC) or Team
(499 USDC) on Base. A confirmed ERC-20 transfer and a wallet signature unlock
the organization for 30 days and its included API operations.

Start on Base Sepolia:

```txt
ENERGON_X402_PAY_TO=0xYourPublicReceivingAddress
ENERGON_BASE_RPC_URL=https://sepolia.base.org
ENERGON_BILLING_NETWORK=eip155:84532
ENERGON_BILLING_ASSET=0x036CbD53842c5426634e7929541eC2318f3dCF7e
```

For real payments, use a production Base RPC provider and switch both x402 and
human billing to Base mainnet:

```txt
ENERGON_X402_ENABLED=true
ENERGON_X402_NETWORK=eip155:8453
ENERGON_X402_ASSET=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
ENERGON_X402_PAY_TO=0xYourPublicReceivingAddress
ENERGON_BILLING_NETWORK=eip155:8453
ENERGON_BILLING_ASSET=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
ENERGON_BASE_RPC_URL=https://<your-production-base-rpc>
```

Use the public address only. A private key, seed phrase or wallet backup must
never be added to Railway, the dashboard, a local `.env`, or the repository.
