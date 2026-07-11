# Contributing to Energon OS

Thanks for helping build permissioned memory infrastructure for AI agents.

## What belongs in this repo

Energon OS is the **memory OS layer** only:

- identity, scopes, permissions, context packing, audit logs
- API routes agents call for allowed memory
- human operator surfaces for inspection and export

Do **not** add agent runtimes, workflow orchestration, browser automation, wallet custody, or payment orchestration here. Those belong in separate services that call Energon through the API.

## Before you open a PR

1. Search existing issues and pull requests for duplicates.
2. For large changes, open an issue first and describe the boundary impact.
3. Keep diffs focused. One concern per pull request when possible.

## Local setup

```bash
docker compose up -d

export DATABASE_URL=postgres://energon:energon@localhost:5432/energon
export ENERGON_API_KEY_PEPPER=$(openssl rand -hex 32)
export ENERGON_ADMIN_TOKEN=$(openssl rand -hex 32)

cargo run -p energon-api
```

For the web dashboard:

```bash
bun install
bun run api:dev
bun run web:dev
```

Fast in-memory API demo without Postgres:

```bash
bun run api:dev
```

## Required checks

```bash
cargo fmt --all
cargo test --workspace
bun run web:lint
bun run web:build
```

## Code guidelines

- Rust domain logic stays in `crates/energon-core`.
- Permission filtering must happen **before** retrieval, ranking, summarization, packing, or delivery.
- Never bypass identity or scope checks in API routes, exports, or dashboard views.
- Do not commit secrets, `.env` files, private keys, or local data.
- Match existing naming, module boundaries, and documentation style.

## Pull request checklist

- [ ] Tests added or updated for behavior changes
- [ ] Docs updated when API, scopes, or product boundary changes
- [ ] No secrets or local-only paths committed
- [ ] `cargo fmt --all` and `cargo test --workspace` pass
- [ ] Web lint and build pass if `apps/web` changed

## Security

If you find a security issue, do **not** open a public issue. Email **security@energon.os** with reproduction steps and impact. We will respond as quickly as we can.

## License

By contributing, you agree that your contributions are licensed under the Apache License 2.0.
