# @energon/sdk

The server-side TypeScript SDK for Energon OS, the memory and context control
plane for agent swarms.

```ts
import { Energon } from "@energon/sdk";

const energon = new Energon({
  baseUrl: process.env.ENERGON_API_URL!,
  apiKey: process.env.ENERGON_AGENT_API_KEY!,
  paymentSignature: async () => process.env.ENERGON_PAYMENT_SIGNATURE,
});

await energon.memory.remember({
  content: "The upstream source changed its rate limit.",
  tags: ["source", "rate-limit"],
});

const context = await energon.context.build({
  task: "Plan the next retry window.",
  tokenBudget: 1_500,
});

await energon.claims.assert({
  subject: "vendor:upstream",
  predicate: "rate_limit_state",
  value: { status: "reduced" },
  confidenceBps: 8_700,
  evidenceMemoryIds: ["mem_..."],
});
```

`Energon` always derives the calling agent, swarm, project, and role from the
API key. The SDK does not accept identity fields for agent operations, so an
agent cannot impersonate another swarm member through SDK input.

Claims are structured facts rather than free-form memory. The agent submits
confidence and evidence, while Energon derives role authority from the
operator-managed policy. Conflicting claims return a branch identifier for the
operator workflow instead of silently overwriting the existing fact.

The client intentionally does not automatically retry `POST` operations: a
timeout after a write can be ambiguous without an idempotency key. It retries
safe `GET` requests only, and exposes the original HTTP error through
`EnergonError`.

Keep agent API keys in a server runtime, worker, container secret, or secrets
manager. Do not expose them in browser code.
