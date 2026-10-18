"use client";

import { siPython, siRust, siTypescript, type SimpleIcon } from "simple-icons";
import { useState } from "react";

const syntaxParts = /(\/\/.*$|#.*$|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\b(?:import|from|const|await|new|use|let|mut|Some|None|pub|fn|struct|impl|return|as|in)\b|\b\d[\d_]*\b|::|=>|->|[{}[\]();:,.!?&=])/gm;
const syntaxKeywords = new Set([
  "import", "from", "const", "await", "new", "use", "let", "mut", "Some",
  "None", "pub", "fn", "struct", "impl", "return", "as", "in",
]);

function renderSyntax(code: string) {
  return code.split(syntaxParts).map((part, index) => {
    let className = "";

    if (part.startsWith("//") || part.startsWith("#")) className = "syntax-comment";
    else if (part.startsWith('"') || part.startsWith("'")) className = "syntax-string";
    else if (/^\d/.test(part)) className = "syntax-number";
    else if (syntaxKeywords.has(part)) className = "syntax-keyword";
    else if (/^(?:::|=>|->|[{}[\]();:,.!?&=])$/.test(part)) className = "syntax-operator";

    return className ? <span className={className} key={index}>{part}</span> : part;
  });
}

function LanguageIcon({ icon }: { icon: SimpleIcon }) {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
      <path d={icon.path} />
    </svg>
  );
}

const quickstarts = [
  {
    id: "typescript",
    label: "TypeScript",
    icon: siTypescript,
    filename: "quickstart.ts",
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
    icon: siPython,
    filename: "quickstart.py",
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
    icon: siRust,
    filename: "quickstart.rs",
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
    <div className="lx-code" aria-label={`${active.label} SDK quickstart`}>
      <div className="lx-code-bar">
        <div className="lx-code-tabs" role="tablist" aria-label="Choose an SDK language">
          {quickstarts.map((quickstart) => (
            <button
              key={quickstart.id}
              id={`${quickstart.id}-sdk-tab`}
              data-language={quickstart.id}
              type="button"
              role="tab"
              aria-selected={quickstart.id === active.id}
              aria-controls={`${quickstart.id}-sdk-panel`}
              onClick={() => setActiveId(quickstart.id)}
            >
              <LanguageIcon icon={quickstart.icon} />
              {quickstart.label}
            </button>
          ))}
        </div>
        <span className="lx-code-file">{active.filename}</span>
      </div>
      <div id={`${active.id}-sdk-panel`} role="tabpanel" aria-labelledby={`${active.id}-sdk-tab`} className="lx-code-body">
        <pre>
          <code>
            {active.code.split("\n").map((line, index) => (
              <span className="lx-code-line" key={index}>
                <i aria-hidden="true">{index + 1}</i>
                {renderSyntax(line)}
                {"\n"}
              </span>
            ))}
          </code>
        </pre>
      </div>
      <div className="lx-code-foot">
        <span>
          <span className="ex-dot ex-dot-ok" /> Server-side · <code>ENERGON_AGENT_API_KEY</code>
        </span>
        <a href={active.guide} target="_blank" rel="noreferrer" aria-label={`Open the ${active.label} SDK guide`}>
          Guide ↗
        </a>
      </div>
    </div>
  );
}
