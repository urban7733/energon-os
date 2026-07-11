## Summary

What changed?

## Boundary check

- [ ] This stays inside Energon OS: memory, permissions, context packing, audit, API, dashboard, or docs
- [ ] This does not add agent runtime, workflow orchestration, browser automation, wallet custody, or payment execution

## Verification

- [ ] `cargo fmt --all --check`
- [ ] `cargo test --workspace`
- [ ] `bun run web:lint`
- [ ] `bun run web:build`

## Security notes

Any effect on memory visibility, auth, x402, audit logs, or Obsidian export permissions?
