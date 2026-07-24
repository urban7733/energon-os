# Rust SDK

`energon-sdk` is the server-side Rust client for an authenticated Energon
agent. It lives in `packages/sdk-rust` and is not published to crates.io yet.

## Install from this repository

```toml
[dependencies]
energon-sdk = { git = "https://github.com/urban7733/energon-os" }
```

Keep `ENERGON_AGENT_API_KEY` in a worker, server, container secret, or secrets
manager. It must never be included in browser code.

```rust
use energon_sdk::{BuildContextInput, Energon, RememberInput};

let energon = Energon::new(
    &std::env::var("ENERGON_API_URL")?,
    &std::env::var("ENERGON_AGENT_API_KEY")?,
)?;

let memory = energon.remember(RememberInput {
    content: "Customer has an approved Swiss enterprise contract.".into(),
    tags: vec!["customer".into(), "contract".into(), "verified".into()],
    source: None,
})?;

let context = energon.build_context(BuildContextInput {
    task: "Answer the customer's contract question.".into(),
    project_id: None,
    token_budget: Some(1_500),
})?;
```

## Skill profiles

Profiles are declarative personalization data, not executable tools or trusted
instructions. An agent may create a private profile only for itself; the API
returns only profiles that are assigned to that agent.

```rust
use energon_sdk::CreateSkillInput;

let profile = energon.create_skill(CreateSkillInput {
    name: "Careful support writer".into(),
    instructions: "Cite verified facts and ask before sending an external reply.".into(),
    allowed_tools: vec!["read_memory".into(), "write_draft".into()],
    requires_approval_for: vec!["send_external_reply".into()],
})?;

let assigned_profiles = energon.list_skills()?;
```

## Operations and dashboard statistics

Agents can read the same operational state that drives the dashboard without
receiving secrets or another agent’s private memory content:

```rust
let overview = energon.operational_overview()?;
println!("{}", overview.stats.memory.total_memories);
```

The response includes the organization agent directory, memory and usage
statistics, event-delivery state, role policies, conflict metadata, the
agent’s assigned skills, and plan entitlement. It excludes API keys, payment
payer data, memory previews, and unassigned skill profiles.

The SDK intentionally does not retry write requests automatically. A timeout
after `POST` can be ambiguous without an idempotency key. HTTP errors are
returned as `EnergonError::Api`.
