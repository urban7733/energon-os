# Cloudflare Deployment

Energon OS runs on Cloudflare. The pieces:

```txt
pages     Cloudflare Pages project `energon-os` (apps/web/pages-proxy): public front door
web       Cloudflare Worker `energon-os` (apps/web, built with OpenNext): Next.js + Better Auth + dashboard
api       Rust/Axum API in a Cloudflare Container (root Dockerfile)
worker    Rust embedding worker in a Cloudflare Container (root Dockerfile, ENERGON_PROCESS=energon-worker)
postgres  Managed PostgreSQL with pgvector, reachable from Cloudflare (for example Neon or Supabase)
nats      Optional: only needed to publish outbox events; without it events stay pending
```

The Rust binaries cannot run as plain Workers, which is why the API and the
embedding worker use Containers. This repository ships the container image
(`Dockerfile`), not the Containers Worker configuration yet.

## 1. Postgres

Create a managed Postgres with the `vector` extension available and give its
connection string (with `sslmode=require`) to the API, the worker, and the web
Worker as `DATABASE_URL`. The API runs the repository migrations automatically
at startup.

## 2. API container

Build the root `Dockerfile` and set:

```txt
DATABASE_URL=<managed Postgres URL>
ENERGON_ENV=production
ENERGON_BIND_ADDR=0.0.0.0:3000
ENERGON_API_KEY_PEPPER=<openssl rand -hex 32>
ENERGON_JWKS_URL=https://energon-os.pages.dev/api/auth/jwks
ENERGON_JWT_ISSUER=https://energon-os.pages.dev
ENERGON_JWT_AUDIENCE=energon-api
ENERGON_WEB_ORIGIN=https://energon-os.pages.dev
ENERGON_CLIENT_IP_HEADER=cf-connecting-ip
OPENAI_API_KEY=<OpenAI key>
```

Use `ENERGON_ADMIN_TOKEN` only to bootstrap the first agent, then remove it.
Do not set `ENERGON_DEV_AUTH` in production. Forward the incoming request
unchanged from the Containers Worker so `cf-connecting-ip` (set by Cloudflare's
edge and not spoofable by clients) reaches the API for per-IP limits.

## 3. Embedding worker container

Use the same image with:

```txt
ENERGON_PROCESS=energon-worker
DATABASE_URL=<managed Postgres URL>
OPENAI_API_KEY=<OpenAI key>
ENERGON_EMBEDDING_MODEL=text-embedding-3-small
ENERGON_EMBEDDING_BATCH_SIZE=16
# Optional:
ENERGON_NATS_URL=nats://<private-nats-host>:4222
ENERGON_EVENT_OUTBOX_BATCH_SIZE=100
```

The worker needs no public route.

## 4. Web Worker (OpenNext)

`apps/web/wrangler.jsonc` defines the `energon-os` Worker. Build-time values
are inlined into the browser bundle and the Content-Security-Policy, so set
them when building:

```bash
cd apps/web
NEXT_PUBLIC_ENERGON_API_BASE_URL=https://<your-api-host> \
NEXT_PUBLIC_SITE_URL=https://energon-os.pages.dev \
bun run deploy:cloudflare
```

`NEXT_PUBLIC_ENERGON_API_BASE_URL` must be the real API origin: the CSP only
allows the dashboard to connect to that origin.

Store secrets with Wrangler, never in `wrangler.jsonc` or Git:

```bash
bunx wrangler secret put DATABASE_URL
bunx wrangler secret put BETTER_AUTH_SECRET      # openssl rand -base64 32
bunx wrangler secret put ENERGON_PROXY_SECRET    # openssl rand -hex 32, same value as on Pages
```

`BETTER_AUTH_URL` and `NEXT_PUBLIC_SITE_URL` are plain vars in `wrangler.jsonc`.

## 5. Pages front door

The Pages project serves the public `energon-os.pages.dev` domain and forwards
every request to the Worker. Because the visitor IP is not guaranteed to
survive that second hop, the proxy forwards it in `x-energon-client-ip`
together with `ENERGON_PROXY_SECRET`. The web Worker only trusts that header
when the secret matches, and otherwise uses Cloudflare's `cf-connecting-ip`.
Without a resolvable client IP, Better Auth would put every visitor into one
shared rate-limit bucket and five failed sign-ins anywhere would block
sign-in for everyone.

Set the same secret on the Pages project (Settings → Variables and Secrets, as
an encrypted secret named `ENERGON_PROXY_SECRET`), then deploy:

```bash
cd apps/web
bun run deploy:pages
```

If you later serve the Worker on its own custom domain instead, the proxy and
the secret are no longer needed: `cf-connecting-ip` is used directly.

### GitHub login

Create a GitHub OAuth application and store its credentials as Worker secrets
(`GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`), never in Git. Redirect URL:

```txt
https://energon-os.pages.dev/api/auth/callback/github
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
never be added to Cloudflare, the dashboard, a local `.env`, or the repository.
