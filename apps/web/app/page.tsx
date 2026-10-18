import Link from "next/link";
import { SiteExperience, AudienceSwitch, ExperienceHero, MemoryJourney } from "./site-experience";
import { ClosingScene } from "./closing-scene";
import { ProductControlPlane } from "./product-control-plane";
import { SdkQuickstart } from "./sdk-quickstart";
import { paymentRails, pricingPlans, productBoundaries, site } from "../lib/site";

const platformPillars = [
  ["Private first", "Every agent starts with its own separate memory."],
  ["Share on purpose", "Choose exactly which project, role, or workspace may use an approved memory."],
  ["Always explainable", "Every context build records what was included and what stayed private."],
] as const;

export default function HomePage() {
  return (
    <SiteExperience><main className="site-shell energon-black-site landing-clean refined-site">
      <header className="topbar" aria-label="Energon OS primary navigation">
        <Link className="brand" href="/" aria-label="Energon OS home">
          <span className="header-logo" aria-hidden="true"><img src="/energon-footer-logo.png" alt="" width="1536" height="1024" /></span>
          <span>Energon</span>
        </Link>
        <nav className="nav-links" aria-label="Main links">
          <a href="#control-plane">Product</a>
          <a href="#agent-economy">Access</a>
          <a href="#sdk">SDK</a>
          <a href="#pricing">Pricing</a>
        </nav>
        <div className="nav-actions">
          <AudienceSwitch />
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

      <ExperienceHero />
      <MemoryJourney />

      <div id="mission" className="hero-wrap">
        <div className="container hero">
          <ProductControlPlane />

          <p className="hero-boundary">Your agents stay in your stack. Energon returns only the memory each identity is permitted to see.</p>
        </div>
      </div>

      <section className="proof-band container" aria-label="Platform pillars">
        {platformPillars.map(([title, detail], index) => (
          <article key={title}>
            <span className="pillar-number">0{index + 1}</span>
            <strong>{title}</strong>
            <p>{detail}</p>
          </article>
        ))}
      </section>

      <section id="agent-economy" className="section agent-economy-section">
        <div className="container">
          <div className="section-heading">
            <p className="eyebrow">Human software · agent infrastructure</p>
            <h2>Made for builders. Ready for agents.</h2>
            <p>
              Manage your agents in the dashboard, or connect them directly through the API.
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


        </div>
      </section>

      <section id="boundary" className="section">
        <div className="container">
          <div className="section-heading">
            <p className="eyebrow">What Energon does</p>
            <h2>Your stack. Connected.</h2>
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

      <section id="sdk" className="section">
        <div className="container api-section">
          <div className="sdk-copy">
            <p className="eyebrow">Developer platform</p>
            <h2>A small integration. A lasting memory.</h2>
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
    </main></SiteExperience>
  );
}
