import Link from "next/link";
import { paymentRails, pricingPlans, productBoundaries, site } from "../lib/site";

const platformPillars = [
  ["Remember", "Save useful project knowledge once instead of repeating it in every prompt."],
  ["Control", "Choose which agents can use each memory: private, project, role, or organization."],
  ["Prove", "Every context build records what was included and what was denied."],
] as const;

const flowSteps = [
  ["01", "Save a fact", "an agent writes a useful note about its work"],
  ["02", "Set access", "keep it private or share it with the right team"],
  ["03", "Ask for context", "an agent requests what it needs for a task"],
  ["04", "Get safe context", "Energon returns only allowed memory and an audit trail"],
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
  ["1", "memory API for every agent"],
  ["4", "steps from fact to context"],
  ["100%", "auditable context builds"],
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

const apiRoutes = [
  ["POST", "/v1/context/build"],
  ["POST", "/v1/memory/write"],
  ["POST", "/v1/memory/promote"],
  ["GET", "/v1/audit/context/{id}"],
  ["auth", "Authorization: Bearer eos_live_..."],
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
          <a href="#api">API</a>
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
            &lt; SAFE MEMORY FOR AI AGENTS
          </Link>
          <h1 id="hero-title">Give every AI agent the context it needs. Nothing it should not see.</h1>
          <p className="hero-lede">
            Energon is a shared memory service for AI agents. Save a useful fact once, choose who
            may use it, and return a small, auditable context pack for every task.
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
              From one saved fact to safe context in four steps.
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
                <em>POST /v1/context/build</em>
                {"\n"}
                agent: researcher-17 · project: launch · task: prepare the brief
                {"\n"}
                → allowed_context_pack.json + audit record
              </div>
            </div>
          </div>

          <p className="hero-boundary">Your agents stay in your own app. Energon only stores and returns permitted memory.</p>
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
            <h2>Your agents stay yours. Their useful memory becomes safe and reusable.</h2>
            <p>Energon does not run your agents or workflows. It gives them a reliable shared memory layer with clear access rules.</p>
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
            <h2>Everything an agent needs to remember safely across tasks.</h2>
            <p>
              Start private. Share intentionally. Ask for context when an agent needs to work.
              Inspect the audit trail when you need to know why a memory was used.
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

      <section id="api" className="section">
        <div className="container api-section">
          <div>
            <p className="eyebrow">Developer platform</p>
            <h2>One API call gives an agent the right context for its task.</h2>
            <p className="hero-lede">
              Connect any agent with an API key. It writes memory, asks for a context pack, and
              receives only the information you allow it to use.
            </p>
            <div className="hero-actions">
              <Link className="primary-action" href="/dashboard">
                Try the API
              </Link>
              <Link className="secondary-action" href="/llms-full.txt">
                llms-full.txt
              </Link>
            </div>
          </div>
          <div className="api-panel" aria-label="API routes">
            {apiRoutes.map(([method, route]) => (
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
