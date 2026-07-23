import Link from "next/link";
import { ClosingScene } from "./closing-scene";
import { paymentRails, pricingPlans, productBoundaries, site } from "../lib/site";

const platformPillars = [
  ["Private first", "Every agent starts with its own separate memory."],
  ["Share on purpose", "Choose exactly which project, role, or workspace may use an approved memory."],
  ["Always explainable", "Every context build records what was included and what stayed private."],
] as const;

const flowSteps = [
  ["01", "Keep it private", "an agent saves a note that only it can use"],
  ["02", "Share with approval", "you choose whether a project, role, or workspace may use it"],
  ["03", "Ask for context", "an agent requests help for one task"],
  ["04", "Receive only what is allowed", "Energon returns the right notes and records the decision"],
] as const;

const products = [
  ["Agent identity", "Give every agent its own API key, project, and role."],
  ["Private memory", "Start with a note that belongs to one agent only."],
  ["Safe sharing", "Promote useful memory to open, organization, project, or role scope."],
  ["Context builder", "Ask for a task and receive only the allowed context."],
  ["Permission filter", "Access is checked before retrieval and before delivery."],
  ["Audit logs", "See which memories shaped every returned context pack."],
] as const;

const stats = [
  ["Private", "memory starts separate for every agent"],
  ["Shared", "only after your approval"],
  ["Audited", "every context decision is recorded"],
] as const;

const scopes = [
  ["agent_private", "a note starts with the agent that wrote it"],
  ["role", "share with agents that have the same job"],
  ["project", "share with agents working on the same project"],
  ["org", "share across one organization"],
  ["open", "make an approved memory broadly available"],
] as const;

const relationships = [
  ["Organization", "one customer, lab, or company"],
  ["Project", "one product, mission, or client case"],
  ["Role", "researcher, writer, reviewer, or operator"],
  ["Agent", "one AI worker with its own private memory"],
  ["Audit", "a record of every context decision"],
] as const;

const sdkOperations = [
  ["SDK", "swarm.runtime()"],
  ["SDK", "memory.remember()"],
  ["SDK", "memory.share()"],
  ["SDK", "context.build()"],
  ["auth", "agent API key, kept server-side"],
] as const;

export default function HomePage() {
  return (
    <main className="site-shell">
      <header className="topbar" aria-label="Energon OS primary navigation">
        <Link className="brand" href="/" aria-label="Energon OS home">
          <span className="brand-mark" aria-hidden="true" />
          <span>Energon</span>
        </Link>
        <nav className="nav-links" aria-label="Main links">
          <a href="#boundary">Boundary</a>
          <a href="#products">Platform</a>
          <a href="#sdk">SDK</a>
          <a href="#scopes">Memory</a>
          <a href="#pricing">Pricing</a>
        </nav>
        <div className="nav-actions">
          <a
            className="nav-badge"
            href="https://github.com/urban7733/energon-os"
            target="_blank"
            rel="noreferrer"
          >
            GitHub
          </a>
          <Link className="nav-cta" href="/dashboard">
            Open dashboard
          </Link>
        </div>
      </header>

      <div className="hero-wrap">
        <div className="container hero">
          <Link className="crumb" href="#boundary">
            &lt; PRIVATE MEMORY FOR AI AGENT SWARMS
          </Link>
          <h1 id="hero-title">Every AI agent keeps its own memory. Share only what your swarm needs.</h1>
          <p className="hero-lede">
            Energon gives every agent private memory by default. When a note becomes useful to
            other agents, you approve exactly who can use it: one role, one project, or your whole workspace.
          </p>
          <div className="hero-actions">
            <Link className="primary-action" href="/dashboard">
              Open dashboard
            </Link>
            <a className="secondary-action" href="#how-it-works">
              See how it works
            </a>
          </div>

          <hr className="dot-rule" aria-hidden="true" />

          <div className="frame" aria-label="Context build pipeline">
            <div className="frame-header">
              Keep each agent's memory separate, then share only what helps the swarm.
            </div>
            <div className="frame-body">
              <div className="flow-grid">
                {flowSteps.map(([number, title, detail]) => (
                  <article className="flow-cell" key={title}>
                    <span>{number}</span>
                    <strong>{title}</strong>
                    <p>{detail}</p>
                  </article>
                ))}
              </div>
              <div className="code-block">
                <em>context.build()</em>
                {"\n"}
                authenticated agent → permission filter → relevant memory
                {"\n"}
                → context pack + audit record
              </div>
            </div>
          </div>

          <p className="hero-boundary">Your agents stay in your own app. Energon only returns memory they are allowed to see.</p>
        </div>
      </div>

      <section className="stats-band container" aria-label="Platform metrics">
        {stats.map(([value, label]) => (
          <article key={label}>
            <strong>{value}</strong>
            <span>{label}</span>
          </article>
        ))}
      </section>

      <section className="proof-band container" aria-label="Platform pillars">
        {platformPillars.map(([title, detail]) => (
          <article key={title}>
            <strong>{title}</strong>
            <p>{detail}</p>
          </article>
        ))}
      </section>

      <section id="boundary" className="section">
        <div className="container">
          <div className="section-heading">
            <p className="eyebrow">What Energon does</p>
            <h2>Your agents stay yours. Their private memory stays separate until you decide to share it.</h2>
            <p>Energon does not run your agents or workflows. It gives them safe memory access with clear sharing rules.</p>
          </div>
          <div className="frame">
            <div className="frame-header">{site.companyStackNote}</div>
            <div className="frame-body">
              <div className="company-layer-table" aria-label="Product boundary">
                {productBoundaries.map(([label, detail]) => (
                  <div className="company-layer-row boundary-row" key={label}>
                    <strong>{label}</strong>
                    <p>{detail}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <hr className="dot-rule container" aria-hidden="true" />

      <section id="products" className="section" aria-labelledby="how-it-works">
        <div className="container">
          <div className="section-heading">
            <p id="how-it-works" className="eyebrow">What is inside</p>
            <h2>Private memory for each agent. Shared memory for the right group.</h2>
            <p>
              Start with separate memory for every agent. Share an approved note only with the
              agents that need it. Inspect the record whenever you want to know why a note was used.
            </p>
          </div>
          <div className="product-grid">
            {products.map(([title, detail]) => (
              <article key={title}>
                <strong>{title}</strong>
                <p>{detail}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="sdk" className="section">
        <div className="container api-section">
          <div>
            <p className="eyebrow">Developer platform</p>
            <h2>One SDK call gives an agent only the memory it may use for a task.</h2>
            <p className="hero-lede">
              Connect the SDK to an agent runtime. The control plane derives its identity, keeps
              memory private first, and returns only the context that agent is allowed to use.
            </p>
            <div className="hero-actions">
              <Link className="primary-action" href="/dashboard">
                Open dashboard
              </Link>
              <Link className="secondary-action" href="/llms-full.txt">
                llms-full.txt
              </Link>
            </div>
          </div>
          <div className="api-panel" aria-label="SDK operations">
            {sdkOperations.map(([method, route]) => (
              <div className="api-row" key={route}>
                <span>{method}</span>
                <strong>{route}</strong>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="access" className="section">
        <div className="container">
          <div className="section-heading">
            <p className="eyebrow">Access model</p>
            <h2>Decide who can use each memory.</h2>
            <p>
              Put agents in an organization, project, and role. Energon uses those relationships
              before it builds a context pack.
            </p>
          </div>
          <div className="relationship-map">
            {relationships.map(([title, detail]) => (
              <article key={title}>
                <span>{title}</span>
                <p>{detail}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="scopes" className="section">
        <div className="container">
          <div className="section-heading">
            <p className="eyebrow">Memory scopes</p>
            <h2>Start private. Share only when you choose.</h2>
            <p>Every agent writes private memory first. Promotion to a shared scope is explicit and audited.</p>
          </div>
          <div className="scope-table">
            {scopes.map(([scope, detail]) => (
              <div className="scope-row" key={scope}>
                <strong>{scope}</strong>
                <p>{detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="section">
        <div className="container">
          <div className="section-heading">
            <p className="eyebrow">Pricing</p>
            <h2>Pay for the memory your agents use.</h2>
            <p>Agents can pay per request. Human operators can unlock a plan with USDC on Base.</p>
          </div>
          <div className="pricing-grid">
            {pricingPlans.map((plan) => (
              <article key={plan.name}>
                <span>{plan.audience}</span>
                <strong>{plan.name}</strong>
                <p>{plan.price}</p>
                <em>{plan.settlement}</em>
                <ul>
                  {plan.details.map((detail) => (
                    <li key={detail}>{detail}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
          <div className="payment-rail-grid">
            {paymentRails.map((rail) => (
              <article key={rail.name}>
                <strong>{rail.name}</strong>
                <p>{rail.role}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="thesis-section">
        <div className="container">
          <p>Other memory tools retrieve what looks relevant. Energon retrieves what an agent is allowed to know.</p>
          <div className="thesis-meta">
            <span>private by default</span>
            <span>shared on approval</span>
            <span>context on demand</span>
            <span>auditable by design</span>
          </div>
        </div>
      </section>

      <ClosingScene />

      <footer className="footer">
        <div className="container footer-content">
          <p>{site.name} — memory layer for AI agents.</p>
          <nav aria-label="Footer links">
            <Link href="/llms.txt">llms.txt</Link>
            <Link href="/llms-full.txt">llms-full.txt</Link>
            <Link href="/dashboard">Dashboard</Link>
          </nav>
        </div>
      </footer>
    </main>
  );
}
