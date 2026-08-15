"use client";

import { useState } from "react";

const views = {
  operations: {
    label: "Operations",
    title: "Company operations",
    note: "Agents are coordinating against approved company context.",
    metrics: [["Agents", "07"], ["Tasks", "18"], ["Blocked", "01"]],
    events: [
      ["research-01", "Competitor brief updated", "complete"],
      ["sales-02", "Enterprise proposal assembled", "running"],
      ["review-01", "Pricing claim needs approval", "blocked"],
      ["ops-01", "Daily operating memory sealed", "complete"],
    ],
    trace: ["identity: verified", "role: operator", "project: launch", "context: 14 records", "decision: allowed"],
  },
  memory: {
    label: "Memory",
    title: "Memory control plane",
    note: "Private knowledge becomes shared company memory only after approval.",
    metrics: [["Private", "142"], ["Shared", "36"], ["Conflicts", "02"]],
    events: [
      ["agent_private", "Customer objection pattern", "private"],
      ["project", "Launch positioning approved", "shared"],
      ["role", "Reviewer verification policy", "shared"],
      ["org", "Enterprise plan supports SSO", "verified"],
    ],
    trace: ["source: sales-02", "scope: agent_private", "target: project", "reason: verified fact", "promotion: approved"],
  },
  audit: {
    label: "Audit",
    title: "Decision audit",
    note: "Every context pack explains what the agent could and could not see.",
    metrics: [["Allowed", "14"], ["Denied", "03"], ["Tokens", "1.8k"]],
    events: [
      ["ctx_92f1", "Enterprise pricing answer", "allowed"],
      ["ctx_92e8", "Launch copy verification", "allowed"],
      ["ctx_92d4", "Private founder note", "denied"],
      ["ctx_92c9", "Support escalation", "allowed"],
    ],
    trace: ["request: ctx_92f1", "credential: valid", "policy: project+role", "denied: 3 records", "audit: sealed"],
  },
} as const;

type ViewId = keyof typeof views;

export function ProductControlPlane() {
  const [activeView, setActiveView] = useState<ViewId>("operations");
  const active = views[activeView];

  return (
    <div id="control-plane" className="product-control-plane" aria-label="Interactive Energon OS product preview">
      <div className="control-plane-bar">
        <div>
          <span className="control-plane-mark" aria-hidden="true" />
          <strong>ENERGON / CONTROL PLANE</strong>
        </div>
        <span>DEMO WORKSPACE&nbsp;&nbsp;·&nbsp;&nbsp;SYSTEM ONLINE</span>
      </div>

      <div className="control-plane-tabs" role="tablist" aria-label="Product preview views">
        {(Object.keys(views) as ViewId[]).map((viewId, index) => (
          <button
            key={viewId}
            type="button"
            role="tab"
            aria-selected={activeView === viewId}
            aria-controls="control-plane-view"
            onClick={() => setActiveView(viewId)}
          >
            <span>0{index + 1}</span>
            {views[viewId].label}
          </button>
        ))}
      </div>

      <div id="control-plane-view" className="control-plane-view" role="tabpanel">
        <aside className="control-plane-sidebar" aria-label="Workspace agents">
          <span className="control-label">AUTONOMOUS COMPANY</span>
          <strong>Energon Labs</strong>
          <div className="control-agent-list">
            {["operator", "research-01", "sales-02", "review-01", "ops-01"].map((agent, index) => (
              <div key={agent}>
                <i className={index === 3 ? "waiting" : "online"} />
                <span>{agent}</span>
                <em>{index === 3 ? "review" : "active"}</em>
              </div>
            ))}
          </div>
          <div className="control-sidebar-foot">
            <span>+ 2 agents</span>
            <span>3 active missions</span>
          </div>
        </aside>

        <section className="control-plane-main">
          <div className="control-view-heading">
            <div>
              <span className="control-label">LIVE PRODUCT VIEW</span>
              <h2>{active.title}</h2>
            </div>
            <span className="control-live"><i /> live</span>
          </div>
          <p>{active.note}</p>
          <div className="control-metrics">
            {active.metrics.map(([label, value]) => (
              <div key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
          <div className="control-events" key={activeView}>
            {active.events.map(([source, event, state], index) => (
              <div className="control-event" style={{ "--event-index": index } as React.CSSProperties} key={`${source}-${event}`}>
                <span>{source}</span>
                <strong>{event}</strong>
                <em data-state={state}>{state}</em>
              </div>
            ))}
          </div>
        </section>

        <aside className="control-plane-trace">
          <span className="control-label">LATEST TRACE</span>
          <div className="trace-id">{activeView === "audit" ? "CTX_92F1" : "EVT_7A21"}</div>
          <div className="trace-lines" key={`${activeView}-trace`}>
            {active.trace.map((line, index) => (
              <div style={{ "--trace-index": index } as React.CSSProperties} key={line}>
                <span>{index === active.trace.length - 1 ? "└─" : "├─"}</span>
                <code>{line}</code>
              </div>
            ))}
          </div>
          <div className="trace-result">[ VERIFIED ]</div>
        </aside>
      </div>

      <div className="control-plane-command">
        <span>$</span>
        <code>energon company status --watch</code>
        <i aria-hidden="true" />
      </div>
    </div>
  );
}
