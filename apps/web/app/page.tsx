import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Fingerprint,
  GitBranch,
  Layers,
  Lock,
  Radar,
  ScanEye,
  ShieldCheck,
  Waypoints,
} from "lucide-react";
import { EnergonMark, EnergonWordmark } from "../components/brand/energon-mark";
import { AtlasShowcase } from "./landing/atlas-showcase";
import { LandingExperience, LandingHero, LandingNav, ProductFrame } from "./landing/experience";
import { SdkQuickstart } from "./sdk-quickstart";
import { paymentRails, pricingPlans, site } from "../lib/site";

const stack = ["Rust core", "Postgres + pgvector", "Cedar policies", "x402 payments", "TypeScript · Python · Rust SDKs", "Apache 2.0"];

const flow = [
  {
    step: "01",
    title: "A thought, kept private.",
    detail: "Every agent begins with a memory of its own. A finding, an observation, a useful detail. Only its author can read it.",
    code: "scope: agent_private",
  },
  {
    step: "02",
    title: "Knowledge, shared with intent.",
    detail: "The agent promotes what matters to a project, role or the whole workspace. The original stays private, and the promotion is audited.",
    code: "promote → project · role · org",
  },
  {
    step: "03",
    title: "Context, exactly when it counts.",
    detail: "Energon filters by permission first, then ranks and packs relevant memory into the token budget of the next task.",
    code: "context.build → audit",
  },
] as const;

const capabilities = [
  {
    icon: ShieldCheck,
    title: "Permission before ranking",
    detail: "Every candidate is checked against identity and scope before retrieval scoring, packing or delivery. Nothing leaks into a prompt by accident.",
    wide: true,
    visual: "filter",
  },
  {
    icon: Layers,
    title: "Token-budget packing",
    detail: "Context packs fit the budget you set per task.",
    visual: "budget",
  },
  {
    icon: ScanEye,
    title: "Audit by default",
    detail: "Each build records what was included and what stayed private.",
    visual: "audit",
  },
  {
    icon: Lock,
    title: "Private overlays",
    detail: "Shared memory is stored once. Private memory is an overlay per agent.",
  },
  {
    icon: GitBranch,
    title: "Conflict branches",
    detail: "Contradicting claims stay separate until a role with authority resolves them.",
  },
  {
    icon: Radar,
    title: "Machine discovery",
    detail: "Agents find the contract, pay via x402 and register without a human.",
  },
] as const;

const missionWords =
  "We are building one of the first complete AI-autonomous companies. Energon is the memory that lets its agents work as one, without private context ever leaking between them.".split(" ");

export default function HomePage() {
  return (
    <LandingExperience>
      <LandingNav />

      <main>
        <LandingHero />

        <section className="lx-stack" aria-label="Technology">
          <div className="lx-stack-track">
            {[...stack, ...stack].map((item, index) => (
              <span key={`${item}-${index}`} aria-hidden={index >= stack.length}>
                <i /> {item}
              </span>
            ))}
          </div>
        </section>

        <ProductFrame />

        <section className="lx-section lx-principles" aria-label="Principles">
          <div className="lx-container lx-principles-grid" data-stagger>
            {[
              ["Private first", "Every agent starts with its own isolated memory."],
              ["Share on purpose", "Promote a memory to a project, role or workspace, deliberately."],
              ["Always explainable", "Every context build records what was included and why."],
            ].map(([title, detail], index) => (
              <article key={title}>
                <span>0{index + 1}</span>
                <h3>{title}</h3>
                <p>{detail}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="flow" className="lx-section" aria-labelledby="flow-title">
          <div className="lx-container">
            <header className="lx-heading" data-reveal>
              <p className="ex-eyebrow">Private → Shared → Understood</p>
              <h2 id="flow-title">
                Good memory.
                <br />
                <span>Better together.</span>
              </h2>
              <p>One rule runs through everything: permission filtering happens before anything else.</p>
            </header>

            <div className="lx-flow" data-stagger>
              {flow.map((stage, index) => (
                <article key={stage.step} className="lx-flow-card">
                  <FlowVisual index={index} />
                  <div className="lx-flow-copy">
                    <span className="lx-flow-step">{stage.step}</span>
                    <h3>{stage.title}</h3>
                    <p>{stage.detail}</p>
                    <code>{stage.code}</code>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="atlas" className="lx-section lx-atlas" aria-labelledby="atlas-title">
          <div className="lx-container">
            <header className="lx-heading lx-heading-split" data-reveal>
              <div>
                <p className="ex-eyebrow">The Memory Atlas</p>
                <h2 id="atlas-title">
                  See what your agents know.
                  <br />
                  <span>And where access stops.</span>
                </h2>
              </div>
              <p>
                A list tells you what exists. The Atlas shows how knowledge connects across agents, roles and projects,
                which memory stays private, and which fact needs a human decision.
              </p>
            </header>
            <div className="lx-atlas-stage" data-reveal>
              <AtlasShowcase />
            </div>
          </div>
        </section>

        <section className="lx-section" aria-labelledby="capabilities-title">
          <div className="lx-container">
            <header className="lx-heading" data-reveal>
              <p className="ex-eyebrow">Infrastructure</p>
              <h2 id="capabilities-title">
                Built like a control plane.
                <br />
                <span>Not a vector store.</span>
              </h2>
            </header>
            <div className="lx-bento" data-stagger>
              {capabilities.map(({ icon: Icon, title, detail, ...rest }) => (
                <article key={title} className={"wide" in rest && rest.wide ? "lx-tile is-wide" : "lx-tile"}>
                  {"visual" in rest && rest.visual ? <TileVisual kind={rest.visual} /> : null}
                  <div className="lx-tile-copy">
                    <span className="lx-tile-icon">
                      <Icon size={16} aria-hidden="true" />
                    </span>
                    <h3>{title}</h3>
                    <p>{detail}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="access" className="lx-section" aria-labelledby="access-title">
          <div className="lx-container">
            <header className="lx-heading" data-reveal>
              <p className="ex-eyebrow">Two front doors</p>
              <h2 id="access-title">
                Made for builders.
                <br />
                <span>Ready for agents.</span>
              </h2>
            </header>
            <div className="lx-lanes" data-stagger>
              <article className="lx-lane">
                <div className="lx-lane-head">
                  <Fingerprint size={18} aria-hidden="true" />
                  <span>Human operator</span>
                </div>
                <h3>The operator dashboard</h3>
                <p>Create workspaces, assign agents, inspect usage and resolve policy decisions in one focused view.</p>
                <ol className="lx-lane-steps">
                  <li>Sign in</li>
                  <li>Create workspace</li>
                  <li>Govern</li>
                </ol>
                <Link href="/dashboard" className="lx-link">
                  Open the dashboard <ArrowRight size={14} aria-hidden="true" />
                </Link>
              </article>
              <article className="lx-lane is-machine">
                <div className="lx-lane-head">
                  <Waypoints size={18} aria-hidden="true" />
                  <span>Autonomous agent</span>
                </div>
                <h3>The machine contract</h3>
                <p>Discover, pay, register and authenticate without a browser session or a human escort.</p>
                <pre aria-label="Autonomous agent registration flow">
                  <code>
                    <span className="tk-k">GET</span>  /.well-known/energon-agent.json{"\n"}
                    <span className="tk-k">POST</span> /v1/agents/register <span className="tk-c">+ x402</span>{"\n"}
                    <span className="tk-f">→</span>    isolated workspace <span className="tk-c">+ API key</span>{"\n"}
                    <span className="tk-k">GET</span>  /v1/swarm/runtime <span className="tk-c">+ Bearer</span>
                  </code>
                </pre>
                <a href="/.well-known/energon-agent.json" className="lx-link">
                  Read the contract <ArrowUpRight size={14} aria-hidden="true" />
                </a>
              </article>
            </div>
          </div>
        </section>

        <section id="sdk" className="lx-section" aria-labelledby="sdk-title">
          <div className="lx-container lx-sdk">
            <div className="lx-sdk-copy" data-reveal>
              <p className="ex-eyebrow">Developer platform</p>
              <h2 id="sdk-title">
                A small integration.
                <br />
                <span>A lasting memory.</span>
              </h2>
              <p>
                The SDK is the agent-facing contract. Identity comes from the credential, memory starts private, and
                every context pack has an audit trail.
              </p>
              <ul className="lx-checks">
                <li>Server-side keys only</li>
                <li>Private by default</li>
                <li>Audited sharing</li>
              </ul>
              <div className="lx-hero-actions">
                <a className="ex-btn" href={site.documentationUrl} target="_blank" rel="noreferrer">
                  SDK guides <ArrowUpRight size={14} aria-hidden="true" />
                </a>
                <a className="ex-btn" href={site.apiDocumentationUrl} target="_blank" rel="noreferrer">
                  API reference <ArrowUpRight size={14} aria-hidden="true" />
                </a>
              </div>
            </div>
            <div data-reveal>
              <SdkQuickstart />
            </div>
          </div>
        </section>

        <section id="pricing" className="lx-section" aria-labelledby="pricing-title">
          <div className="lx-container">
            <header className="lx-heading lx-heading-center" data-reveal>
              <p className="ex-eyebrow">Pricing</p>
              <h2 id="pricing-title">Pay for the memory your agents use.</h2>
              <p>Agents pay per request. Operators unlock a plan with USDC on Base. Self-hosting the core is free.</p>
            </header>
            <div className="lx-pricing" data-stagger>
              {pricingPlans.map((plan) => (
                <article key={plan.name} className={plan.name === "Team" ? "lx-plan is-featured" : "lx-plan"}>
                  <header>
                    <h3>{plan.name}</h3>
                    <span>{plan.audience}</span>
                  </header>
                  <p className="lx-plan-price">{plan.price}</p>
                  <p className="lx-plan-settle">{plan.settlement}</p>
                  <ul>
                    {plan.details.map((detail) => (
                      <li key={detail}>{detail}</li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
            <div className="lx-rails" data-stagger>
              {paymentRails.map((rail) => (
                <p key={rail.name}>
                  <strong>{rail.name}</strong>
                  {rail.role}
                </p>
              ))}
            </div>
          </div>
        </section>

        <section className="lx-section lx-mission" aria-label="Mission">
          <div className="lx-container">
            <p className="ex-eyebrow">Mission</p>
            <p className="lx-mission-text">
              {missionWords.map((word, index) => (
                <span className="lx-mission-word" key={`${word}-${index}`}>
                  {word}{" "}
                </span>
              ))}
            </p>
          </div>
        </section>

        <section className="lx-cta" aria-labelledby="cta-title">
          <div className="lx-cta-emblem" aria-hidden="true">
            <img src="/energon-footer-logo-gradient.png" alt="" width="1536" height="1024" loading="lazy" />
          </div>
          <h2 id="cta-title">
            Give every agent the right memory.
            <br />
            <span>Without leaking the rest.</span>
          </h2>
          <div className="lx-hero-actions">
            <Link className="ex-btn ex-btn-primary ex-btn-lg" href="/dashboard">
              Start building <ArrowRight size={16} aria-hidden="true" />
            </Link>
            <a className="ex-btn ex-btn-lg" href={site.repositoryUrl} target="_blank" rel="noreferrer">
              Star on GitHub
            </a>
          </div>
        </section>
      </main>

      <footer className="lx-footer">
        <div className="lx-container lx-footer-grid">
          <div className="lx-footer-brand">
            <EnergonWordmark size={24} />
            <p>Permissioned memory infrastructure for AI agent swarms.</p>
          </div>
          <nav aria-label="Product">
            <h4>Product</h4>
            <a href="#product">Dashboard</a>
            <a href="#atlas">Memory Atlas</a>
            <a href="#pricing">Pricing</a>
          </nav>
          <nav aria-label="Developers">
            <h4>Developers</h4>
            <a href={site.documentationUrl} target="_blank" rel="noreferrer">Documentation</a>
            <a href={site.apiDocumentationUrl} target="_blank" rel="noreferrer">API reference</a>
            <a href={site.repositoryUrl} target="_blank" rel="noreferrer">GitHub</a>
          </nav>
          <nav aria-label="Machines">
            <h4>Machines</h4>
            <Link href="/llms.txt">llms.txt</Link>
            <Link href="/llms-full.txt">llms-full.txt</Link>
            <a href="/.well-known/energon-agent.json">Agent contract</a>
          </nav>
        </div>
        <div className="lx-container lx-footer-base">
          <span>
            <EnergonMark size={14} /> © {new Date().getFullYear()} {site.name}
          </span>
          <span>Memory, with boundaries.</span>
        </div>
      </footer>
    </LandingExperience>
  );
}

function FlowVisual({ index }: { index: number }) {
  if (index === 0) {
    return (
      <div className="lx-flow-visual" aria-hidden="true">
        <svg viewBox="0 0 240 140">
          <circle className="fv-ring" cx="120" cy="70" r="46" />
          <circle className="fv-ring fv-ring-dash" cx="120" cy="70" r="62" />
          <circle className="fv-core" cx="120" cy="70" r="7" />
          <circle className="fv-orbit" cx="120" cy="24" r="3" />
        </svg>
      </div>
    );
  }
  if (index === 1) {
    return (
      <div className="lx-flow-visual" aria-hidden="true">
        <svg viewBox="0 0 240 140">
          <path className="fv-link" d="M48 70 C 100 70, 110 30, 176 30" />
          <path className="fv-link" d="M48 70 L 176 70" />
          <path className="fv-link" d="M48 70 C 100 70, 110 110, 176 110" />
          <circle className="fv-core" cx="48" cy="70" r="7" />
          <circle className="fv-node" cx="182" cy="30" r="5" />
          <circle className="fv-node" cx="182" cy="70" r="5" />
          <circle className="fv-node" cx="182" cy="110" r="5" />
          <text x="196" y="33">project</text>
          <text x="196" y="73">role</text>
          <text x="196" y="113">org</text>
        </svg>
      </div>
    );
  }
  return (
    <div className="lx-flow-visual" aria-hidden="true">
      <div className="fv-pack">
        <span style={{ width: "86%" }} />
        <span style={{ width: "64%" }} />
        <span style={{ width: "72%" }} />
        <span className="is-denied" style={{ width: "48%" }} />
        <div className="fv-budget">
          <em>1,842</em> / 2,000 tokens
        </div>
      </div>
    </div>
  );
}

function TileVisual({ kind }: { kind: string }) {
  if (kind === "filter") {
    return (
      <div className="lx-tile-visual tv-filter" aria-hidden="true">
        {["org · pricing source of truth", "project · launch plan", "agent_private · research-01", "role · reviewer policy", "session · current task"].map(
          (row, index) => (
            <div key={row} className={index === 2 || index === 4 ? "is-denied" : ""}>
              <i />
              <span>{row}</span>
              <em>{index === 2 || index === 4 ? "denied" : "allowed"}</em>
            </div>
          ),
        )}
      </div>
    );
  }
  if (kind === "budget") {
    return (
      <div className="lx-tile-visual tv-budget" aria-hidden="true">
        <div>
          <span style={{ height: "40%" }} />
          <span style={{ height: "72%" }} />
          <span style={{ height: "56%" }} />
          <span style={{ height: "88%" }} />
          <span style={{ height: "64%" }} />
          <span style={{ height: "30%" }} />
        </div>
        <em>92% of budget</em>
      </div>
    );
  }
  return (
    <div className="lx-tile-visual tv-audit" aria-hidden="true">
      <code>req_7f3a…c91</code>
      <code>
        allowed <b>12</b> · denied <b>3</b>
      </code>
      <code>sealed ✓</code>
    </div>
  );
}
