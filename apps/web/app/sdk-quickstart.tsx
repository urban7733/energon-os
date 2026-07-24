"use client";

import { useState } from "react";

const quickstarts = [
  {
    id: "typescript",
    label: "TypeScript",
    filename: "quickstart.ts",
    runtime: "Node · server runtime",
    guide: "https://github.com/urban7733/energon-os/blob/main/docs/sdk-typescript.md",
    code: `import { Energon } from "@energon/sdk";

const energon = new Energon({
  baseUrl: process.env.ENERGON_API_URL!,
  apiKey: process.env.ENERGON_AGENT_API_KEY!,
});

const memory = await energon.memory.remember({
  content: "Verified: enterprise plan supports SSO.",
  tags: ["pricing", "verified"],
});

const context = await energon.context.build({
  task: "Answer an enterprise pricing question.",
  tokenBudget: 1_500,
});`,
  },
  {
    id: "python",
    label: "Python",
    filename: "quickstart.py",
    runtime: "Python 3.10+ · server runtime",
    guide: "https://github.com/urban7733/energon-os/blob/main/docs/sdk-python.md",
    code: `import os

from energon_sdk import Energon

energon = Energon(
    base_url=os.environ["ENERGON_API_URL"],
    api_key=os.environ["ENERGON_AGENT_API_KEY"],
)

memory = energon.memory.remember(
    content="Verified: enterprise plan supports SSO.",
    tags=["pricing", "verified"],
)

context = energon.context.build(
    task="Answer an enterprise pricing question.",
    token_budget=1_500,
)`,
  },
  {
    id: "rust",
    label: "Rust",
    filename: "quickstart.rs",
    runtime: "Rust · server runtime",
    guide: "https://github.com/urban7733/energon-os/blob/main/docs/sdk-rust.md",
    code: `use energon_sdk::{BuildContextInput, Energon, RememberInput};

let energon = Energon::new(
    &std::env::var("ENERGON_API_URL")?,
    &std::env::var("ENERGON_AGENT_API_KEY")?,
)?;

let memory = energon.remember(RememberInput {
    content: "Verified: enterprise plan supports SSO.".into(),
    tags: vec!["pricing".into(), "verified".into()],
    source: None,
})?;

let context = energon.build_context(BuildContextInput {
    task: "Answer an enterprise pricing question.".into(),
    project_id: None,
    token_budget: Some(1_500),
})?;`,
  },
] as const;

type QuickstartId = (typeof quickstarts)[number]["id"];

export function SdkQuickstart() {
  const [activeId, setActiveId] = useState<QuickstartId>("typescript");
  const active = quickstarts.find((quickstart) => quickstart.id === activeId) ?? quickstarts[0];

  return (
    <div className="sdk-terminal" aria-label={`${active.label} SDK quickstart`}>
      <div className="sdk-terminal-bar">
        <div className="sdk-language-tabs" role="tablist" aria-label="Choose an SDK language">
          {quickstarts.map((quickstart) => (
            <button
              key={quickstart.id}
              id={`${quickstart.id}-sdk-tab`}
              className="sdk-language-tab"
              type="button"
              role="tab"
              aria-selected={quickstart.id === active.id}
              aria-controls={`${quickstart.id}-sdk-panel`}
              onClick={() => setActiveId(quickstart.id)}
            >
              {quickstart.label}
            </button>
          ))}
        </div>
        <span>{active.filename} · {active.runtime}</span>
      </div>
      <div id={`${active.id}-sdk-panel`} role="tabpanel" aria-labelledby={`${active.id}-sdk-tab`}>
        <pre>
          <code>{active.code}</code>
        </pre>
      </div>
      <div className="sdk-terminal-note">
        <span>SERVER ONLY</span>
        Keep <code>ENERGON_AGENT_API_KEY</code> in an agent runtime, worker, or server. Never ship it to a browser.
        <a href={active.guide} target="_blank" rel="noreferrer">
          Read {active.label} guide →
        </a>
      </div>
    </div>
  );
}
