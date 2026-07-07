import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { indexedClaims, paymentRails, pricingPlans, site } from "../lib/site";

const platformPillars = [
  ["API-first", "External agents call Energon directly through authenticated API routes."],
  ["Permission-first", "Denied memory is removed before retrieval, ranking, packing, or delivery."],
  ["Audit-native", "Context builds and private-to-shared promotions leave durable evidence."],
] as const;

const flowSteps = [
  ["01", "Agent call", "agent_id, org, project, role, session, purpose"],
  ["02", "Policy filter", "remove forbidden memory before candidate search"],
  ["03", "Memory graph", "shared memory plus explicit private overlays"],
  ["04", "Context pack", "compact JSON with influencing memory ids"],
] as const;

const primitives = [
  [
    "Identity registry",
    "Map every calling agent to organization, project, role, team, and session context.",
  ],
  [
    "Scoped memory",
    "Store open, org, project, role, private, and session memory without duplicating shared facts.",
  ],
  [
    "Context builder",
    "Assemble the smallest allowed memory pack for the current task and token budget.",
  ],
  [
    "Promotion audit",
    "Move agent_private memory into shared scopes only through explicit promotion records.",
  ],
  [
    "Boundary ledger",
    "Keep external files, browsers, tools, and runtimes outside Energon's ownership boundary.",
  ],
  [
    "Operator dashboard",
    "Give humans a control surface while the API remains the primary product surface for agents.",
  ],
] as const;

const relationships = [
  ["Organization", "company, lab, customer tenant"],
  ["Project", "mission, case, product surface"],
  ["Role", "researcher, writer, reviewer, operator"],
  ["Team", "agents that collaborate on the same outcome"],
  ["Session", "short-lived task or investigation window"],
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

const useCases = [
  ["Research swarms", "Agents search the internet and coordinate findings while Energon controls what memory they can reuse."],
  ["Company operators", "Human teams keep dashboard visibility for writes, promotions, audits, and context inspection."],
  ["Future agent payments", "Separate crypto-payment services can let agents pay and settle autonomously while Energon supplies identity, memory, permissions, and audit context."],
  ["Future SDKs", "The long-term surface is high-volume agent access, not manual dashboard operation."],
] as const;

export default function HomePage() {
  return (
    <main className="site-shell">
      <header className="topbar" aria-label="Energon OS primary navigation">
        <Link className="brand brand-image-link" href="/" aria-label="Energon OS home">
          <Image
            className="brand-logo"
            src="/energonos-wordmark.png"
            alt="Energon OS"
            width={580}
            height={180}
            priority
          />
        </Link>
        <nav className="nav-links" aria-label="Main links">
          <a href="#platform">Platform</a>
          <a href="#api">API</a>
          <a href="#access">Access</a>
          <a href="#scopes">Scopes</a>
          <a href="#pricing">Pricing</a>
          <Link href="/dashboard">Dashboard</Link>
        </nav>
      </header>

      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-copy">
          <p className="eyebrow">AI agent memory platform</p>
          <h1 id="hero-title">Permissioned memory infrastructure for autonomous agents.</h1>
          <p className="hero-lede">
            Energon OS is the context layer external agents call through an API. It decides which
            memory an agent is allowed to see, builds a compact context pack, and records the audit
            trail behind that decision.
          </p>
          <div className="hero-actions">
            <Link className="primary-action" href="/dashboard" aria-label="Open Energon dashboard">
              <span>Open dashboard</span>
              <ArrowRight size={18} aria-hidden="true" />
            </Link>
            <a className="secondary-action" href="#api">
              View API model
            </a>
          </div>
          <p className="hero-boundary">
            Not an agent runtime. Not workflow orchestration. Energon owns memory, permissions,
            context packing, and audit logs.
          </p>
        </div>

        <aside className="hero-system" aria-label="Energon OS context build flow">
          <div className="system-toolbar">
            <span>POST /v1/context/build</span>
            <strong>permission filter first</strong>
          </div>

          <div className="request-card">
            <div>
              <span className="panel-label">request identity</span>
              <strong>research.agent.17</strong>
            </div>
            <div className="request-fields" aria-label="Request fields">
              <span>org: venture-lab</span>
              <span>project: person-search</span>
              <span>role: researcher</span>
              <span>session: web-intel-042</span>
            </div>
          </div>

          <div className="flow-board">
            {flowSteps.map(([number, title, detail]) => (
              <article className="flow-node" key={title}>
                <span>{number}</span>
                <strong>{title}</strong>
                <p>{detail}</p>
              </article>
            ))}
          </div>

          <div className="output-card">
            <div>
              <span className="panel-label">response</span>
              <strong>allowed_context_pack.json</strong>
            </div>
            <p>memory_ids, summaries, scopes, promotion lineage, audit id</p>
          </div>
        </aside>
      </section>

      <section id="platform" className="proof-band" aria-label="Energon platform pillars">
        {platformPillars.map(([title, detail]) => (
          <article key={title}>
            <strong>{title}</strong>
            <p>{detail}</p>
          </article>
        ))}
      </section>

      <section className="product-visual-section" aria-labelledby="product-visual-title">
        <div className="product-visual-copy">
          <p className="eyebrow">Product layer</p>
          <h2 id="product-visual-title">One memory layer for every specialized agent.</h2>
          <p>
            Research, coding, writing, planning, data, and analytics agents can stay in their own
            runtimes. Energon gives them the same permissioned context layer: identity, memory
            scopes, retrieval, promotion, billing, and audit through one API.
          </p>
        </div>
        <Image
          className="product-visual-image"
          src="/theenergon.png?v=direct-copy"
          alt="Energon OS product visualization showing specialized agents connected to a central memory layer"
          width={1254}
          height={1254}
          sizes="(max-width: 1260px) calc(100vw - 40px), 1220px"
          unoptimized
        />
      </section>

      <section className="platform-section" aria-labelledby="platform-title">
        <div className="section-heading">
          <p className="eyebrow">Platform primitives</p>
          <h2 id="platform-title">A memory control plane built for agent-scale usage.</h2>
          <p>
            The dashboard can stay for human operators, but the product is designed for fleets of
            external agents that need reliable memory access without sharing the wrong context.
          </p>
        </div>
        <div className="primitive-grid">
          {primitives.map(([title, detail]) => (
            <article key={title}>
              <strong>{title}</strong>
              <p>{detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="api" className="api-section" aria-labelledby="api-title">
        <div className="api-copy">
          <p className="eyebrow">Agent API</p>
          <h2 id="api-title">Agents bring their tools. Energon returns the memory they can use.</h2>
          <p>
            A web-search agent, coding agent, finance agent, or operations agent can keep its
            browser, files, and runtime elsewhere. Energon only accepts selected memory writes and
            returns permissioned context for the next task.
          </p>
        </div>
        <div className="api-panel" aria-label="Energon API contract example">
          <div className="api-panel-header">
            <span>context request</span>
            <strong>authenticated</strong>
          </div>
          <div className="api-row">
            <span>caller</span>
            <strong>agent_id + org boundary</strong>
          </div>
          <div className="api-row">
            <span>intent</span>
            <strong>task, project, role, session</strong>
          </div>
          <div className="api-row">
            <span>filtering</span>
            <strong>before retrieval</strong>
          </div>
          <div className="api-row">
            <span>delivery</span>
            <strong>allowed context pack</strong>
          </div>
        </div>
      </section>

      <section id="access" className="access-section" aria-labelledby="access-title">
        <div className="section-heading">
          <p className="eyebrow">Access model</p>
          <h2 id="access-title">Who belongs together decides which memory is visible.</h2>
          <p>
            Energon resolves relationships before context is assembled. That is how agents can
            coordinate around a person search, a company project, or a short-lived investigation
            without merging their private files or raw tool outputs.
          </p>
        </div>
        <div className="relationship-map" aria-label="Agent relationship dimensions">
          {relationships.map(([title, detail]) => (
            <article key={title}>
              <span>{title}</span>
              <p>{detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="scopes" className="scope-section" aria-labelledby="scope-title">
        <div className="scope-copy">
          <p className="eyebrow">Memory scopes</p>
          <h2 id="scope-title">Shared memory is stored once. Private memory stays an overlay.</h2>
        </div>
        <div className="scope-table" aria-label="Energon memory scopes">
          {scopes.map(([scope, detail]) => (
            <div className="scope-row" key={scope}>
              <strong>{scope}</strong>
              <p>{detail}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="use-case-section" aria-labelledby="use-case-title">
        <div>
          <p className="eyebrow">Operating model</p>
          <h2 id="use-case-title">Built for agents first, with a dashboard when humans need control.</h2>
        </div>
        <div className="use-case-grid">
          {useCases.map(([title, detail]) => (
            <article key={title}>
              <strong>{title}</strong>
              <p>{detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="pricing" className="pricing-section" aria-labelledby="pricing-title">
        <div className="section-heading">
          <p className="eyebrow">Crypto-only pricing</p>
          <h2 id="pricing-title">Agents pay programmatically. Humans pay plans in stablecoins.</h2>
          <p>
            Energon paid usage is crypto-only. The payment execution layer lives outside the memory
            core and grants signed entitlements before the API returns paid context.
          </p>
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
        <div className="payment-rail-grid" aria-label="Energon payment rails">
          {paymentRails.map((rail) => (
            <article key={rail.name}>
              <strong>{rail.name}</strong>
              <p>{rail.role}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="thesis-section" aria-label="Energon OS product thesis">
        <p>A vector database retrieves similar text. Energon OS retrieves allowed context.</p>
        <div className="thesis-meta">
          <span>permission-aware retrieval</span>
          <span>explicit private-to-shared promotion</span>
          <span>API and SDK surface for external agents</span>
        </div>
      </section>

      <section className="proof-band final-proof" aria-label="Energon OS indexed claims">
        {indexedClaims.slice(0, 3).map((claim) => (
          <article key={claim}>
            <p>{claim}</p>
          </article>
        ))}
      </section>

      <section className="footer-transition" aria-hidden="true" />

      <footer className="footer">
        <div className="footer-visual" aria-hidden="true">
          <Image
            src="/energon-footer-universe.png"
            alt=""
            fill
            sizes="100vw"
            quality={92}
          />
        </div>
        <div className="footer-content">
          <p>{site.name}: memory and context infrastructure for AI-native companies.</p>
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
