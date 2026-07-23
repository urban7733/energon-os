# TypeScript SDK

`@energon/sdk` is the primary developer interface to Energon OS. The Rust
service remains the authenticated control plane; application code integrates
through the SDK rather than coupling itself to individual HTTP routes.

The package currently lives at `packages/sdk-typescript`; it is not published
to npm yet.

## Workspace use

```bash
bun run sdk:check
bun run sdk:test
bun run sdk:build
```

After a reviewed public package release, consumers install it with `bun add
@energon/sdk` or `npm install @energon/sdk`.

Use the SDK from an agent runtime, worker, server, or container. Agent API keys
are credentials and must never be included in a browser bundle.

```ts
import { Energon } from "@energon/sdk";

const energon = new Energon({
  baseUrl: process.env.ENERGON_API_URL!,
  apiKey: process.env.ENERGON_AGENT_API_KEY!,
  paymentSignature: async () => process.env.ENERGON_PAYMENT_SIGNATURE,
});

const runtime = await energon.swarm.runtime();
// The returned identity comes from the API key, not from application input.

const privateMemory = await energon.memory.remember({
  content: "Customer policy changed: verify regional eligibility before checkout.",
  tags: ["policy", "checkout"],
});

await energon.memory.share({
  memoryId: privateMemory.memory_id,
  target: "project",
  reason: "All checkout agents need this verified policy.",
});

const context = await energon.context.build({
  task: "Handle a checkout request for this customer.",
  tokenBudget: 1_500,
});

await energon.claims.assert({
  subject: "customer:123",
  predicate: "regional_eligibility",
  value: { approved: true, region: "CH" },
  confidenceBps: 9_100,
  evidenceMemoryIds: [privateMemory.memory_id],
});
```

## Guarantees

The SDK purposely exposes high-level swarm operations:

```txt
memory.remember()     private memory for the authenticated agent
memory.share()        explicit, audited promotion to a shared scope
context.build()       permission-filtered context pack
claims.assert()       structured claim with evidence and agent confidence
audit.context()       inspect the context decision
audit.promotion()     inspect a sharing decision
swarm.runtime()       validate agent identity and active control-plane guarantees
```

Agent identity, swarm membership, project, and role are derived from the
credential by the control plane. They are not accepted as SDK input. Memory
writes do not automatically retry because a network timeout can be ambiguous
without an idempotency key. Safe `GET` requests retry at most twice after the
initial attempt for transient network and availability failures.

When x402 is enabled, supply `paymentSignature` so the client obtains a fresh
payment payload immediately before each request. A `402` becomes an
`EnergonError` whose `paymentRequired` field contains the server challenge.

Claim authority is intentionally absent from `claims.assert()`: it is derived
from the active agent role's operator-managed policy. A close contradiction
returns `resolution: "contested"` and a `conflict_id`; the human operator then
resolves the two persisted branches in the dashboard.

## Publishing

Run these checks before publishing a package release:

```bash
bun run sdk:check
bun run sdk:test
bun run sdk:build
```

The source package does not make a public registry release by itself. Publish
only after the package version, changelog, provenance, and npm access policy
are reviewed.
