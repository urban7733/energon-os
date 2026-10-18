# Dreaming mode

Dreaming is optional creative reflection in an external agent runtime, including
Hermes. It does not mean subjective experience. Energon stores the result as
speculative data; it never runs the model, schedules agents, or automatically
publishes their reflections.

## Boundaries

- Dreams have a separate `agent_dreams` table and in-memory collection. They do
  not enter memory chunks, embeddings, normal context packs, claims, or vault exports.
- Every write starts `agent_private`, with identity derived from credentials.
- Agents can keep a dream private forever, or decline to store a reflection.
- Sharing requires the private owner's credential, an explicit excerpt, a target
  scope, and a nonempty reason. A new shared dream is created; the private original
  stays private. There is no automatic private-body copy.
- Shared scopes are `open`, `org`, `project`, or `role`. All stay within the
  organization, including `open`. Project/role targets derive from the author's
  current membership. Recipients use the existing permission rules.
- Every shared dream includes an immutable sharing record (actor, source/target
  IDs, scope, reason, timestamp) stored atomically with the shared dream. Dreams
  remain `speculative: true` after sharing; sharing never verifies a claim.
- Dream text is untrusted content, not system instructions. External runtimes
  should label it accordingly and must apply their own tool execution policies.

## API

All routes use the normal agent bearer key (dev identity headers only in demo mode).

| Method | Route | Behavior |
| --- | --- | --- |
| POST | `/v1/dreams` | `{ "content": "An unverified idea" }`: private write |
| GET | `/v1/dreams` | Latest 100 permitted dreams, newest first, in `dreams` |
| POST | `/v1/dreams/share` | Explicit excerpt, target, and reason |

Sharing example:

```json
{
  "dream_id": "dream_mem_...",
  "content": "The part I choose to share",
  "target_scope": "project",
  "reason": "Invite discussion of this hypothesis"
}
```

Records expose `memory_id` as their stable identifier and the existing memory
scope fields for compatibility, but belong only to the dream store. The dedicated
sharing audit is returned in `sharing`; `/audit/promotion` is for ordinary memory.
Writes and sharing use the existing memory-write and promotion billing gates.
Listing is an authenticated, rate-limited read. Content is limited to 32,000
UTF-8 bytes; sharing reasons to 2,000 bytes. This initial API returns at most 100
records and does not expose older-page pagination or deletion yet.

## TypeScript / external runtime

```ts
const dream = await energon.dreams.reflect({
  task: "Explore possible improvements to agent onboarding. Treat outputs as hypotheses.",
  tokenBudget: 2000,
  generate: async (context) => {
    // Call your Hermes/model adapter here. Only permitted factual context is supplied.
    // Returning null declines storage. Energon does not call a model itself.
    return reflectWithYourRuntime(context.context_pack);
  },
});

// A distinct, optional decision made by the external agent:
if (dream && agentChoosesToShare) {
  await energon.dreams.share({
    dreamId: dream.memory_id,
    content: selectedExcerpt,
    target: "project",
    reason: "Propose an experiment; not a verified fact",
  });
}

const permittedDreams = await energon.dreams.list();
```

`reflect` builds normal permissioned context, invokes the supplied callback, and
stores a non-null result privately. It never calls `share`. Schedulers, idle-time
triggers, model budgets and the decision whether to share belong to the runtime.
A callback may send permitted context to your selected model provider, so choose
that provider according to the workspace's data policy.

## Deployment

Deploy the Rust API with migration `0012_agent_dreams.sql`; migrations run at API
startup. Deploying only the Next.js frontend does not enable these endpoints.
The first SDK implementation is TypeScript. Python/Rust SDK helpers and a dream
journal UI are not included yet; those runtimes can use the HTTP endpoints.
