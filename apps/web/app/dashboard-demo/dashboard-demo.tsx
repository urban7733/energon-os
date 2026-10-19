"use client";

import dynamic from "next/dynamic";
import { Activity, Coins, Database, Gauge } from "lucide-react";
import { AnalyticsDeck } from "../../components/dashboard/analytics-deck";
import { DreamJournal } from "../../components/dashboard/dream-journal";
import { DashboardFrame, type DashboardNavItem } from "../../components/dashboard/dashboard-frame";
import {
  demoAgents,
  demoConflicts,
  demoDreamRequest,
  demoMemories,
  demoRolePolicies,
  demoScopes,
  demoUsage,
} from "../../lib/demo-workspace";

const MemoryAtlas = dynamic(() => import("../../components/dashboard/memory-atlas"), {
  ssr: false,
  loading: () => <div className="ax-loading" aria-label="Loading Memory Atlas" />,
});

type DemoView = "overview" | "graph" | "agents" | "records" | "dreams" | "billing";

const views: Record<DemoView, { section: string; title: string; subtitle: string }> = {
  overview: {
    section: "Overview",
    title: "Control your autonomous company.",
    subtitle: "Usage, agents and memory in one focused operating view.",
  },
  graph: {
    section: "Memory Atlas",
    title: "See how memory connects.",
    subtitle: "Agents, scopes and policies in one live topology.",
  },
  agents: {
    section: "Agents",
    title: "Your agent team.",
    subtitle: "Every agent has its own identity, role and project boundary.",
  },
  records: {
    section: "Memory",
    title: "Workspace memory.",
    subtitle: "Private overlays and shared records, by scope.",
  },
  dreams: {
    section: "Dreams",
    title: "What your agents imagine.",
    subtitle: "Private reflections stay private. Shared excerpts, labelled as speculation.",
  },
  billing: {
    section: "Billing",
    title: "Usage and settlement.",
    subtitle: "Metered requests settled in USDC.",
  },
};

export function DashboardDemo({ view }: { view: DemoView }) {
  const copy = views[view];
  const nav: DashboardNavItem[] = [
    { label: "Overview", href: "/dashboard-demo?view=overview", icon: "overview", active: view === "overview" },
    { label: "Memory Atlas", href: "/dashboard-demo?view=graph", icon: "atlas", active: view === "graph" },
    { label: "Agents", href: "/dashboard-demo?view=agents", icon: "agents", active: view === "agents" },
    { label: "Memory", href: "/dashboard-demo?view=records", icon: "memory", active: view === "records" },
    { label: "Dreams", href: "/dashboard-demo?view=dreams", icon: "dreams", active: view === "dreams" },
    { label: "Billing", href: "/dashboard-demo?view=billing", icon: "billing", active: view === "billing" },
  ];

  return (
    <DashboardFrame
      nav={nav}
      userEmail="demo@energon.dev"
      workspaceLabel="Energon Labs"
      section={copy.section}
      title={copy.title}
      subtitle={copy.subtitle}
      badge="Sample data"
    >
      <div className="dashboard-console">
        <div className="dx-status" aria-label="System status">
          <span className="dx-status-item">
            <Gauge size={14} aria-hidden="true" /> API <strong>online</strong>
            <span className="ex-dot ex-dot-ok" />
          </span>
          <span className="dx-status-item">
            <Database size={14} aria-hidden="true" /> Storage <strong>postgres</strong>
          </span>
          <span className="dx-status-item">
            <Coins size={14} aria-hidden="true" /> x402 <strong>enabled</strong>
          </span>
          <span className="dx-status-item">
            <Activity size={14} aria-hidden="true" /> Policy <strong>private by default</strong>
          </span>
        </div>

        {view === "overview" ? (
          <AnalyticsDeck
            usage={demoUsage}
            scopes={demoScopes}
            totalMemories={2847}
            agentCount={12}
            contextAudit={{
              allowed_memory_ids: Array.from({ length: 12 }, (_, index) => `mem_${index + 1}`),
              denied_memory_count: 3,
              estimated_tokens: 1842,
              token_budget: 2000,
            }}
            outbox={{ storage: "postgres", pending: 4, leased: 1, published: 18392, retrying: 2 }}
            lifecycle={[
              ["API health", true, "connected"],
              ["Organization", true, "Energon Labs"],
              ["Registered agents", true, "12 registered"],
              ["Private memory", true, "1,624 records"],
              ["Promotion", true, "audited"],
              ["Context audit", true, "sealed"],
            ]}
            demo
          />
        ) : view === "dreams" ? (
          <DreamJournal orgId="demo" request={demoDreamRequest} />
        ) : view === "graph" ? (
          <MemoryAtlas
            organizationName="Energon Labs"
            agents={demoAgents}
            memories={demoMemories}
            totalMemories={2847}
            rolePolicies={demoRolePolicies}
            conflicts={demoConflicts}
            animated
          />
        ) : (
          <section className="dx-card dx-table-card" aria-label={`${view} sample data`}>
            {view === "agents" ? (
              <DemoTable
                columns={["Agent", "Role", "Project", "Keys", "Status"]}
                rows={demoAgents.map((agent, index) => [
                  <span className="dx-entity" key="a">
                    <span className="dx-entity-avatar">{agent.name.charAt(0)}</span>
                    <span>
                      <strong>{agent.name}</strong>
                      <small>{agent.agent_id}</small>
                    </span>
                  </span>,
                  agent.role_id,
                  agent.project_id,
                  `${1 + (index % 2)} active`,
                  <span className="dx-pill dx-pill-ok" key="s">active</span>,
                ])}
              />
            ) : view === "records" ? (
              <DemoTable
                columns={["Memory", "Scope", "Owner", "Project"]}
                rows={demoMemories.map((memory) => [
                  <span className="dx-entity" key="m">
                    <span>
                      <strong>{memory.content_preview}</strong>
                      <small>{memory.memory_id}</small>
                    </span>
                  </span>,
                  <span className={`dx-pill dx-scope-${memory.scope}`} key="s">
                    {memory.scope.replaceAll("_", " ")}
                  </span>,
                  memory.owner_agent_id ?? "—",
                  memory.project_id ?? "—",
                ])}
              />
            ) : (
              <DemoTable
                columns={["Route", "Calls", "Metered", "Settled"]}
                rows={demoUsage.map((usage) => [
                  <code key="r">{usage.route}</code>,
                  usage.calls.toLocaleString(),
                  usage.paid_calls.toLocaleString(),
                  `${(usage.amount_usdc_micro / 1_000_000).toFixed(2)} USDC`,
                ])}
              />
            )}
          </section>
        )}
      </div>
    </DashboardFrame>
  );
}

function DemoTable({ columns, rows }: { columns: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="dx-table" role="table">
      <div className="dx-table-head" role="row" style={{ gridTemplateColumns: `2fr repeat(${columns.length - 1}, 1fr)` }}>
        {columns.map((column) => (
          <span role="columnheader" key={column}>
            {column}
          </span>
        ))}
      </div>
      {rows.map((row, index) => (
        <div className="dx-table-row" role="row" key={index} style={{ gridTemplateColumns: `2fr repeat(${columns.length - 1}, 1fr)` }}>
          {row.map((cell, cellIndex) => (
            <span role="cell" key={cellIndex}>
              {cell}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}
