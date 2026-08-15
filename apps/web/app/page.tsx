import Link from "next/link";
import { ClosingScene } from "./closing-scene";
import { ProductControlPlane } from "./product-control-plane";
import { SdkQuickstart } from "./sdk-quickstart";
import { paymentRails, pricingPlans, productBoundaries, site } from "../lib/site";

const platformPillars = [
  ["Private first", "Every agent starts with its own separate memory."],
  ["Share on purpose", "Choose exactly which project, role, or workspace may use an approved memory."],
  ["Always explainable", "Every context build records what was included and what stayed private."],
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

const permissionTrace = `// Identity comes from the agent credential.
const runtime = await energon.swarm.runtime();

// Shared memory is explicit and audited.
await energon.memory.share({
  memoryId: memory.memory_id,
  target: "project",
  reason: "Sales agents need this verified fact.",
});

const audit = await energon.audit.context(context.request_id);`;

export default function HomePage() {
  return (
    <main className="site-shell energon-black-site">
      <header className="topbar" aria-label="Energon OS primary navigation">
        <Link className="brand" href="/" aria-label="Energon OS home">
          <span className="brand-mark" aria-hidden="true" />
          <span>Energon</span>
        </Link>
        <nav className="nav-links" aria-label="Main links">
          <a href="#control-plane">Product</a>
          <a href="#agent-economy">Agent economy</a>
          <a href="#sdk">SDK</a>
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

      <section className="image-hero" aria-labelledby="hero-title">
        <div className="image-hero-art" aria-hidden="true">
          <video autoPlay loop muted playsInline preload="auto" poster="/energonos-1-0.png">
            <source src="/media/energon-os-hero-4k.mp4" type="video/mp4" />
          </video>
        </div>
        <div className="image-hero-meta container">
          <p>01 / GLOBAL SWARM MEMORY LAYER</p>
          <a href="#mission">ENTER SYSTEM <span aria-hidden="true">↓</span></a>
        </div>
      </section>

      <div id="mission" className="hero-wrap">
        <div className="container hero">
          <div className="hero-copy-grid">
            <div>
              <Link className="crumb" href="#boundary">
                ENERGON OS / MISSION 01
              </Link>
              <h1 id="hero-title">The memory operating system for autonomous companies.</h1>
            </div>
            <div className="hero-copy-detail">
              <p className="hero-lede">
                Energon gives humans and autonomous web agents one secure control plane for identity,
                private memory, governed sharing, and verifiable context.
              </p>
              <p className="hero-mission"><span>MISSION</span> Building one of the world&apos;s first complete AI-autonomous companies.</p>
              <div className="hero-actions">
                <Link className="primary-action" href="/dashboard">
                  Open dashboard
                </Link>
                <a className="secondary-action" href="#control-plane">
                  Explore the system
                </a>
              </div>
            </div>
          </div>

          <ProductControlPlane />

          <p className="hero-boundary">Your agents stay in your stack. Energon returns only the memory each identity is permitted to see.</p>
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

      <div className="ascii-status-rail container" aria-hidden="true">
        <div className="ascii-status-track">
          <span>[ identity:verified ]──[ scope:private ]──[ permission:allowed ]──[ context:packed ]──[ audit:sealed ]──</span>
          <span>[ identity:verified ]──[ scope:private ]──[ permission:allowed ]──[ context:packed ]──[ audit:sealed ]──</span>
        </div>
      </div>

      <section id="agent-economy" className="section agent-economy-section">
        <div className="container">
          <div className="section-heading">
            <p className="eyebrow">Human software · agent infrastructure</p>
            <h2>Built for people who operate—and agents that operate themselves.</h2>
            <p>
              Humans get a clean control plane. Autonomous web agents get machine discovery,
              x402 onboarding, bearer identity, and direct access to memory and context APIs.
            </p>
          </div>

          <div className="economy-access-grid">
            <article className="economy-access-lane human-lane">
              <div className="economy-lane-heading">
                <span>01 / HUMAN OPERATOR</span>
                <strong>Dashboard access</strong>
              </div>
              <div className="economy-lane-flow" aria-label="Human access flow">
                <span>sign in</span><i>→</i><span>workspace</span><i>→</i><span>govern</span>
              </div>
              <p>Create shared organizations, assign agents, inspect usage, and resolve policy decisions.</p>
              <Link href="/dashboard">Open operator dashboard →</Link>
            </article>

            <article className="economy-access-lane agent-lane">
              <div className="economy-lane-heading">
                <span>02 / AUTONOMOUS AGENT</span>
                <strong>Machine access</strong>
              </div>
              <pre aria-label="Autonomous agent registration flow"><code>{`GET  /.well-known/energon-agent.json
POST /v1/agents/register   + x402
→    isolated workspace   + API key
GET  /v1/swarm/runtime     + Bearer`}</code></pre>
              <p>Discover, pay, register, authenticate, and operate without a browser session or human escort.</p>
              <a href="/.well-known/energon-agent.json">Read machine contract →</a>
            </article>
          </div>

          <div className="economy-machine-rail" aria-label="Autonomous onboarding lifecycle">
            {[
              ["DISCOVER", "read the public machine contract"],
              ["SETTLE", "satisfy the x402 challenge"],
              ["IDENTIFY", "receive an isolated machine identity"],
              ["OPERATE", "use memory, context, and audit APIs"],
            ].map(([label, detail], index) => (
              <div key={label}>
                <span>0{index + 1}</span>
                <strong>{label}</strong>
                <p>{detail}</p>
              </div>
            ))}
          </div>
        </div>
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
          <div className="sdk-copy">
            <p className="eyebrow">Developer platform</p>
            <h2>Give an agent memory without giving it your whole database.</h2>
            <p className="hero-lede">
              The SDK is the agent-facing contract. Identity is derived from the credential, memory
              starts private, and every returned context pack has an audit trail.
            </p>
            <div className="sdk-guarantees" aria-label="SDK guarantees">
              <span>SERVER-SIDE ONLY</span>
              <span>PRIVATE BY DEFAULT</span>
              <span>AUDITED SHARING</span>
            </div>
            <div className="hero-actions">
              <a
                className="primary-action"
                href="https://github.com/urban7733/energon-os/tree/main/docs"
                target="_blank"
                rel="noreferrer"
              >
                Browse SDK guides
              </a>
              <a
                className="secondary-action"
                href="https://github.com/urban7733/energon-os/blob/main/docs/api.md"
                target="_blank"
                rel="noreferrer"
              >
                API reference
              </a>
            </div>
          </div>
          <SdkQuickstart />
        </div>
        <div className="container permission-proof">
          <div>
            <p className="eyebrow">Permission proof</p>
            <h3>Share deliberately. Verify afterwards.</h3>
            <p>Agents cannot declare their own organization, project, or role. The control plane derives those boundaries from the credential.</p>
          </div>
          <pre aria-label="Audited sharing SDK example">
            <code>{permissionTrace}</code>
          </pre>
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
          <div className="ascii-permission-map" aria-hidden="true">
            <pre>{`[ ORG ]──[ PROJECT ]──[ ROLE ]
   │          │           │
   └──────[ AGENT ]───────┴──>[ AUDIT ]`}</pre>
            <div>
              <span>permission.filter&nbsp;&nbsp;[PASS]</span>
              <span>private.overlay&nbsp;&nbsp;&nbsp;[BOUND]</span>
              <span>context.delivery&nbsp;&nbsp;[READY] _</span>
            </div>
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
          <p>
            Our mission is to build one of the world&apos;s first complete AI-autonomous companies.
            Energon is the permissioned memory layer that lets its agents work as one—without
            private context leaking between them.
          </p>
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
