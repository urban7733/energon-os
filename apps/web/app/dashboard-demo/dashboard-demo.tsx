"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bot, Coins, Database, Gauge, RefreshCcw } from "lucide-react";
import { AnalyticsDeck } from "../../components/dashboard/analytics-deck";
import MemoryAtlas from "../../components/dashboard/memory-atlas";
import {
  demoAgents,
  demoConflicts,
  demoMemories,
  demoRolePolicies,
  demoScopes,
  demoUsage,
} from "../../lib/demo-workspace";

export function DashboardDemo({ view }: { view: "overview" | "graph" | "agents" | "records" | "billing" }) {
  const router = useRouter();
  return (
    <main className="dashboard-shell dashboard-demo-capture-shell">
      <aside className="dashboard-rail" aria-label="Dashboard navigation">
        <Link className="brand" href="/" aria-label="Energon OS home">
          <span className="brand-mark" aria-hidden="true" />
          <span>Energon</span>
        </Link>
        <nav>
          <Link className={view === "overview" ? "is-active" : ""} href="/dashboard-demo?view=overview">Overview</Link>
          <Link className={view === "graph" ? "is-active" : ""} href="/dashboard-demo?view=graph">Memory Atlas</Link>
          {(["agents", "records", "billing"] as const).map((item) => (
            <Link key={item} className={view === item ? "is-active" : ""} href={`/dashboard-demo?view=${item}`}>
              {item[0].toUpperCase() + item.slice(1)}
            </Link>
          ))}
        </nav>
        <div className="dashboard-demo-capture-note">
          <strong>Demo workspace</strong>
          <span>Sample data only</span>
        </div>
      </aside>

      <section className="dashboard-main">
        <header className="dashboard-header">
          <div>
            <p className="eyebrow">Workspace overview</p>
            <h1>{view === "graph" ? "See how memory connects." : "Control your autonomous company."}</h1>
          </div>
          <p>{view === "graph" ? "Agents, scopes and policies in one live topology." : "Usage, agents and memory in one focused operating view."}</p>
        </header>

        <div className="dashboard-console">
          <div className="session-bar" aria-label="Demo session and organization">
            <span>Signed in: <strong>demo@energon.os</strong></span>
            <div className="session-actions">
              <span className="demo-org-select">Energon Labs</span>
              <button type="button" onClick={() => router.refresh()}><RefreshCcw size={14} aria-hidden="true" /> Refresh workspace</button>
            </div>
          </div>

          <section className="dashboard-overview" aria-label="Energon operating model">
            <article className="surface-card overview-strip">
              <div className="overview-copy">
                <div className="overview-title"><Bot size={16} aria-hidden="true" /><h2>Private by default</h2></div>
                <p>Agents get scoped context. You approve what becomes shared.</p>
              </div>
              <div className="overview-route" aria-label="Agent request route">
                <span>agent</span><span>permissions</span><span>memory</span>
              </div>
              <div className="overview-statuses" aria-label="System status">
                <span className="overview-status"><Database size={14} aria-hidden="true" /><span>Memory</span><strong>postgres</strong></span>
                <span className="overview-status"><Gauge size={14} aria-hidden="true" /><span>API</span><strong>online</strong></span>
                <span className="overview-status"><Coins size={14} aria-hidden="true" /><span>Payments</span><strong>enabled</strong></span>
              </div>
            </article>
          </section>

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
                token_budget: 6000,
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
          ) : view === "graph" ? (
            <MemoryAtlas
              organizationName="Energon Labs"
              agents={demoAgents}
              memories={demoMemories}
              totalMemories={2847}
              rolePolicies={demoRolePolicies}
              conflicts={demoConflicts}
            />
          ) : (
            <section className="demo-records" aria-label={`${view} sample data`}>
              <p className="eyebrow">Sample workspace · {view}</p>
              <h2>{view === "agents" ? "Your agent team." : view === "records" ? "Workspace memory." : "Usage and settlement."}</h2>
              {view === "agents" ? demoAgents.map((agent) => (
                <article key={agent.agent_id}><strong>{agent.name}</strong><span>{agent.role_id}</span><span>{agent.project_id}</span></article>
              )) : view === "records" ? demoMemories.map((memory) => (
                <article key={memory.memory_id}><strong>{memory.content_preview}</strong><span>{memory.scope}</span></article>
              )) : demoUsage.map((usage) => (
                <article key={usage.route}><strong>{usage.route}</strong><span>{usage.calls.toLocaleString()} calls</span><span>{(usage.amount_usdc_micro / 1_000_000).toFixed(3)} USDC</span></article>
              ))}
            </section>
          )}
        </div>
      </section>
    </main>
  );
}
