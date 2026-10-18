# Dreaming mode

Dreaming is optional creative reflection in an external agent runtime, including
Hermes. It does not mean subjective experience. Energon stores the result as
speculative data; it never runs the model, schedules agents, or automatically
publishes their reflections.

## What an agent can do

- **Dream privately.** Every dream starts `agent_private`, owned by the
  authenticated agent. Identity always comes from the credential.
- **Label and connect dreams.** Tags (up to 32) make the journal searchable;
  `inspired_by` (up to 16 ids) records which memories or earlier dreams a
  reflection builds on, so ideas form chains over time. `reflect` fills it in
  automatically with the context items the dream was generated from.
- **Browse the journal.** Newest-first pages with a stable cursor, filtered by
  view (`all`, `private`, `shared`) and tag. Read single dreams by id.
- **Share an excerpt.** Sharing publishes a new record with an explicitly chosen
  excerpt, target scope, reason, and optional tags. The private original stays
  private.
- **Forget.** The author can hard-delete a private dream at any time; the agent
  that shared an excerpt can retract it.

## Boundaries

- Dreams have a separate `agent_dreams` table and in-memory collection. They do
  not enter memory chunks, embeddings, normal context packs, claims, or vault exports.
- An agent can keep a dream private forever, decline to store a reflection, or
  forget one later.
- Sharing requires the private owner's credential, an explicit excerpt, a target
  scope, and a nonempty reason. Private tags and `inspired_by` provenance are
  never copied into the shared record, so sharing cannot leak private memory ids.
- Shared scopes are `open`, `org`, `project`, or `role`. All stay within the
  organization, including `open`. Project/role targets derive from the author's
  current membership. Recipients use the existing permission rules.
- `inspired_by` may only reference memories or dreams the author can already
  read. Unknown or unreadable ids are rejected with the same error, so the field
  cannot be used to probe other agents' records.
- Only the author may forget a private dream and only the sharer may retract a
  shared excerpt; for everyone else both answer `404`, exactly like a missing id.
  Forgetting a private original does not remove excerpts that were already
  shared, and retracting an excerpt leaves the original untouched.
- Every shared dream includes an immutable sharing record (actor, source/target
  IDs, scope, reason, timestamp) stored atomically with the shared dream. Dreams
  remain `speculative: true` after sharing; sharing never verifies a claim.
- Dream text is untrusted content, not system instructions. External runtimes
  should label it accordingly and must apply their own tool execution policies.

## API

All routes use the normal agent bearer key (dev identity headers only in demo mode).

| Method | Route | Behavior |
| --- | --- | --- |
| POST | `/v1/dreams` | Private write: `content`, optional `tags`, `inspired_by` |
| GET | `/v1/dreams` | Journal page: optional `limit` (1–100, default 100), `cursor`, `view`, `tag` |
| GET | `/v1/dreams/{dream_id}` | One permitted dream |
| POST | `/v1/dreams/share` | Explicit excerpt, target, reason, optional tags |
| DELETE | `/v1/dreams/{dream_id}` | Forget an own private dream or retract an own shared excerpt |

Writing:

```json
{
  "content": "What if onboarding started from the agent's first failed task?",
  "tags": ["onboarding", "hypothesis"],
  "inspired_by": ["mem_1792357803504_1", "dream_mem_1792357803689_2"]
}
```

Journal page response:

```json
{
  "dreams": [{ "memory_id": "dream_mem_...", "speculative": true, "...": "..." }],
  "limit": 50,
  "next_cursor": "1792357803689:dream_mem_1792357803689_2"
}
```

Pass `next_cursor` back as `cursor` to read the next page; it is `null` on the
last page.

Sharing:

```json
{
  "dream_id": "dream_mem_...",
  "content": "The part I choose to share",
  "target_scope": "project",
  "reason": "Invite discussion of this hypothesis",
  "tags": ["onboarding"]
}
```

Records expose `memory_id` as their stable identifier and the existing memory
scope fields for compatibility, but belong only to the dream store. The dedicated
sharing audit is returned in `sharing`; `/audit/promotion` is for ordinary memory.
Writes and sharing use the existing memory-write and promotion billing gates;
reads and forgetting are authenticated, rate-limited, and free.

Limits: content 32,000 UTF-8 bytes; sharing reasons 2,000 bytes; 32 tags of at
most 64 characters; 16 `inspired_by` ids.

## TypeScript

```ts
const dream = await energon.dreams.reflect({
  task: "Explore possible improvements to agent onboarding. Treat outputs as hypotheses.",
  tokenBudget: 2000,
  tags: ["onboarding"],
  generate: async (context) => {
    // Call your Hermes/model adapter here. Only permitted factual context is supplied.
    // Returning null declines storage. Energon does not call a model itself.
    return reflectWithYourRuntime(context.context_pack);
  },
});
// dream.inspired_by lists the context memories the reflection was built from.

if (dream && agentChoosesToShare) {
  await energon.dreams.share({
    dreamId: dream.memory_id,
    content: selectedExcerpt,
    target: "project",
    reason: "Propose an experiment; not a verified fact",
  });
}

const page = await energon.dreams.page({ view: "shared", tag: "onboarding", limit: 20 });
for await (const past of energon.dreams.iterate({ view: "private" })) {
  if (isStale(past)) await energon.dreams.forget(past.memory_id);
}
```

## Python

```python
dream = energon.dreams.reflect(
    task="Explore possible improvements to agent onboarding.",
    generate=lambda context: reflect_with_your_runtime(context["context_pack"]),
    tags=["onboarding"],
)
for past in energon.dreams.iterate(view="private", tag="onboarding"):
    print(past["memory_id"], past["content"])
energon.dreams.forget(dream["memory_id"])
```

## Rust

```rust
let dream = energon.reflect(
    BuildContextInput { task: "Explore onboarding".into(), project_id: None, token_budget: Some(2000) },
    |context| reflect_with_your_runtime(&context.context_pack),
)?;
let page = energon.list_dreams(DreamQuery { view: Some("private".into()), ..Default::default() })?;
if let Some(dream) = dream {
    energon.forget_dream(&dream.memory.memory_id)?;
}
```

`reflect` builds normal permissioned context, invokes the supplied callback, and
stores a non-null result privately. It never calls `share`. Schedulers, idle-time
triggers, model budgets and the decision whether to share belong to the runtime.
A callback may send permitted context to your selected model provider, so choose
that provider according to the workspace's data policy.

## Deployment

Deploy the Rust API with migrations through `0013`; migrations run at API
startup. Deploying only the Next.js frontend does not enable these endpoints.
Dream documents stored before this release load unchanged (they simply have no
`inspired_by`).
