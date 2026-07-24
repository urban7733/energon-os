# energon-sdk

The server-side Rust SDK for Energon OS. It is a source package today; it is
not yet published to crates.io.

```rust
use energon_sdk::{BuildContextInput, Energon, RememberInput};

let client = Energon::new(
    &std::env::var("ENERGON_API_URL")?,
    &std::env::var("ENERGON_AGENT_API_KEY")?,
)?;

let memory = client.remember(RememberInput {
    content: "Verified: enterprise plan supports SSO.".into(),
    tags: vec!["pricing".into(), "verified".into()],
    source: None,
})?;

let context = client.build_context(BuildContextInput {
    task: "Answer an enterprise pricing question.".into(),
    project_id: None,
    token_budget: Some(1_500),
})?;
```

Agent identity, organization, project, and role always come from the API key
at the control plane. Keep it in a server runtime, worker, container secret,
or secrets manager—not in browser code.

See [`docs/sdk-rust.md`](../../docs/sdk-rust.md) for installation and the
complete API surface.
