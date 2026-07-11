# Deployment

Energon OS has two deployable surfaces:

```txt
apps/web          static Next.js export for the public site and operator dashboard
crates/energon-api Rust/Axum API that needs a normal server/container runtime
```

Cloudflare Pages is used for the static web surface. The Rust API is not bundled
into Pages; point `NEXT_PUBLIC_ENERGON_API_BASE_URL` at the production API host.

## Cloudflare Pages

Build and deploy the static site:

```bash
bun run deploy:cloudflare
```

The script runs:

```bash
NEXT_PUBLIC_SITE_URL=https://energon.os \
NEXT_PUBLIC_ENERGON_API_BASE_URL=https://api.energon.os \
bun run web:build

bunx wrangler pages deploy apps/web/out --project-name energon-os
```

Local Pages preview:

```bash
bun run preview:cloudflare
```

## Cloudflare Authentication

Before deploying, authenticate Wrangler:

```bash
bunx wrangler login
bunx wrangler whoami
```

For CI, use `CLOUDFLARE_API_TOKEN` with permissions for Cloudflare Pages/Workers.

## Production API

Run the API on a server/container platform with Postgres and pgvector:

```bash
export DATABASE_URL=postgres://...
export ENERGON_API_KEY_PEPPER=$(openssl rand -hex 32)
export ENERGON_ADMIN_TOKEN=$(openssl rand -hex 32)
export ENERGON_BIND_ADDR=0.0.0.0:3001
cargo run -p energon-api --release
```

For public dashboard usage, expose it behind HTTPS at the URL configured as
`NEXT_PUBLIC_ENERGON_API_BASE_URL`.
