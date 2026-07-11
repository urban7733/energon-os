import Link from "next/link";
import { companyLayers, paymentRails, pricingPlans, productBoundaries, site } from "../lib/site";

const platformPillars = [
  ["Memory only", "Store, scope, filter, and pack context. No agent runtime. No orchestration."],
  ["Developer control", "You decide agent count, scopes, budgets, and who gets more memory."],
  ["Permission-first", "Denied memory is removed before retrieval, ranking, or packing."],
] as const;

const flowSteps = [
  ["01", "Agent call", "agent_id, org, project, role, session, purpose"],
  ["02", "Policy filter", "remove forbidden memory before candidate search"],
  ["03", "Scoped memory", "shared memory plus explicit private overlays"],
  ["04", "Context pack", "compact JSON with influencing memory ids"],
] as const;

const products = [
  ["Identity registry", "Map every agent to org, project, role, and session."],
  ["Scoped memory", "Open, org, project, role, private, and session scopes."],
  ["Context builder", "Pack only allowed memory into a token budget."],
  ["Permission filter", "Check access before retrieval, ranking, or delivery."],
  ["Promotion audit", "Explicit private-to-shared promotion with lineage."],
  ["Audit logs", "Record exactly which memory influenced each build."],
] as const;

const stats = [
  ["7", "memory scopes"],
  ["500", "candidate limit per build"],
  ["100%", "permission check before pack"],
] as const;

const scopes = [
  ["open", "public memory any allowed agent can use"],
  ["org", "tenant-wide memory for one organization"],
  ["project", "mission-specific memory for a known project"],
  ["role", "memory visible to agents with a matching role"],
  ["agent_private", "private overlay owned by one agent"],
  ["user_private", "private overlay owned by one user"],
  ["session", "temporary memory for one task window"],
] as const;

const relationships = [
  ["Organization", "company, lab, customer tenant"],
  ["Project", "mission, case, product surface"],
  ["Role", "researcher, writer, reviewer, operator"],
  ["Team", "agents that collaborate on the same outcome"],
  ["Session", "short-lived task or investigation window"],
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
            &lt; MEMORY OS
          </Link>
          <h1 id="hero-title">The memory OS for AI agents.</h1>
          <p className="hero-lede">
            {site.companyMission} Connect one agent or one million — developers control scopes,
            budgets, and which agent gets more memory than another.
          </p>

          <hr className="dot-rule" aria-hidden="true" />

          <div className="frame" aria-label="Context build pipeline">
            <div className="frame-header">
              Context pipeline. Identify agent, filter permissions, pack memory, record audit.
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
                agent_id: agent.17 · scope: project + role · budget: 8k tokens
                {"\n"}
                → allowed_context_pack.json · audit_id · denied_memory_count
              </div>
            </div>
          </div>

          <p className="hero-boundary">{site.productBoundary}</p>
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
            <p className="eyebrow">Boundary</p>
            <h2>Memory infrastructure. Nothing about what agents do with it.</h2>
            <p>{site.productBoundary}</p>
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

      <section id="company" className="section">
        <div className="container">
          <div className="section-heading">
            <p className="eyebrow">Company</p>
            <h2>An AI-native company — with a memory OS at the core.</h2>
            <p>
              Energon is building a fully autonomous AI-native company. Energon OS is the product
              that ships today: permissioned memory for any agent a developer connects.
            </p>
          </div>
          <div className="company-layer-table scope-table" aria-label="Company model">
            {companyLayers.map(([layer, status, detail]) => (
              <div className="company-layer-row" key={layer}>
                <strong>{layer}</strong>
                <span>{status}</span>
                <p>{detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <hr className="dot-rule container" aria-hidden="true" />

      <section id="products" className="section">
        <div className="container">
          <div className="section-heading">
            <p className="eyebrow">Platform</p>
            <h2>Memory infrastructure when many agents share context.</h2>
            <p>
              Identity, scoped memory, context packing, and audit — for any number of external
              agents you connect.
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
            <h2>Your agents call in. Energon returns the memory they are allowed to use.</h2>
            <p className="hero-lede">
              Authenticate with bearer API keys. Write scoped memory. Build context packs. Read
              audit trails. What agents do after that is entirely yours.
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
            <h2>Developers decide who belongs together — and who gets more memory.</h2>
            <p>
              Energon resolves org, project, role, and session before context is assembled. Token
              budgets and scope rules are yours to set per agent.
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
            <h2>Shared memory is stored once. Private memory stays an overlay.</h2>
            <p>Seven scopes from open to session-private. Promotion is always explicit.</p>
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
            <h2>Pay for memory operations — not for what agents build.</h2>
            <p>Crypto-native metered API for agents. Monthly plans for human operators.</p>
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
          <p>A vector database retrieves similar text. Energon OS retrieves allowed context.</p>
          <div className="thesis-meta">
            <span>memory os only</span>
            <span>developer-controlled access</span>
            <span>permission-aware retrieval</span>
            <span>any agent count</span>
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
