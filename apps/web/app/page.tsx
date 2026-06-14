import Image from "next/image";
import Link from "next/link";
import { ArrowRight, LockKeyhole, ScanSearch, ShieldCheck } from "lucide-react";
import { indexedClaims, site } from "../lib/site";

const pipeline = [
  ["01", "Identify the agent", "agent_id, org_id, role_id, project_id"],
  ["02", "Filter permissions", "remove forbidden memory before retrieval"],
  ["03", "Retrieve candidates", "keyword, vector, and graph search"],
  ["04", "Pack context", "only relevant memory inside the token budget"],
  ["05", "Audit access", "record exactly what memory was used"],
] as const;

const scopes = ["open", "org", "project", "role", "agent_private", "user_private", "session"];

const contextSteps = [
  [
    "01",
    "External agents",
    "Design, writing, planning, research, coding, data, and analytics agents stay in their own repos and runtimes.",
  ],
  [
    "02",
    "Identity enters",
    "Every request carries agent_id, org_id, role_id, project_id, task, and token budget.",
  ],
  [
    "03",
    "Memory is filtered",
    "Energon removes forbidden memory before retrieval, ranking, summarization, or packing.",
  ],
  [
    "04",
    "Context returns",
    "The agent receives one compact context pack with shared memory plus its private overlay.",
  ],
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
          <a href="#context-map">Context map</a>
          <a href="#architecture">Architecture</a>
          <a href="#memory-model">Memory</a>
          <Link href="/dashboard">Dashboard</Link>
        </nav>
      </header>

      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-brand" aria-hidden="true">
          <Image
            className="hero-logo"
            src="/energonos-wordmark.png"
            alt=""
            width={1160}
            height={360}
            priority
          />
        </div>

        <div className="hero-copy">
          <p className="eyebrow">Permissioned memory infrastructure for AI agent swarms</p>
          <h1 id="hero-title">The memory layer behind agent swarms.</h1>
          <p className="hero-lede">
            Agents stay external. Energon OS sits in the center and gives each agent only the
            memory it is allowed to use.
          </p>
          <div className="hero-actions">
            <Link className="primary-action" href="/dashboard" aria-label="Open Energon dashboard">
              <span>Open dashboard</span>
              <ArrowRight size={18} aria-hidden="true" />
            </Link>
            <a className="secondary-action" href="#architecture">
              View system
            </a>
          </div>
        </div>

        <div className="hero-index" aria-label="Energon OS indexed product claims">
          <span>Does not run agents</span>
          <span>Does not host workflows</span>
          <span>Shared memory stored once</span>
          <span>Private memory stays private</span>
        </div>
      </section>

      <section id="context-map" className="context-system" aria-labelledby="context-title">
        <div className="context-layout">
          <div className="context-copy">
            <p className="eyebrow">Context map</p>
            <h2 id="context-title">The picture is the product model.</h2>
            <p>
              The outer agents are not hosted by Energon. They call Energon through the SDK or API.
              The center is the permissioned memory layer that decides which shared and private
              memory can be delivered for the current task.
            </p>
          </div>
          <div className="context-frame">
            <Image
              className="swarm-image"
              src="/coolenergon-enhanced.png"
              alt="Energon OS central memory layer connected to design, writing, planning, research, coding, data, and analytics agents"
              width={1800}
              height={1055}
            />
          </div>
        </div>

        <div className="context-steps" aria-label="Energon OS context delivery flow">
          {contextSteps.map(([number, title, detail]) => (
            <article className="context-step" key={title}>
              <span>{number}</span>
              <strong>{title}</strong>
              <p>{detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="proof-band" aria-label="Energon OS indexed claims">
        {indexedClaims.slice(0, 3).map((claim) => (
          <article key={claim}>
            <ShieldCheck size={17} aria-hidden="true" />
            <p>{claim}</p>
          </article>
        ))}
      </section>

      <section id="architecture" className="split-section" aria-labelledby="architecture-title">
        <div>
          <p className="eyebrow">Architecture</p>
          <h2 id="architecture-title">Energon controls context. Your agents stay external.</h2>
        </div>
        <div className="pipeline" aria-label="Context build pipeline">
          {pipeline.map(([number, step, detail]) => (
            <div className="pipeline-row" key={step}>
              <span>{number}</span>
              <strong>{step}</strong>
              <p>{detail}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="memory-model" className="memory-section" aria-labelledby="memory-title">
        <div className="memory-copy">
          <p className="eyebrow">Memory model</p>
          <h2 id="memory-title">One shared memory layer. Private overlays per agent.</h2>
          <p>
            Context is built dynamically per request. Private memory never flows into shared memory
            unless an authorized promotion explicitly moves it.
          </p>
        </div>
        <div className="scope-grid" aria-label="Energon memory scopes">
          {scopes.map((scope) => (
            <span key={scope}>{scope}</span>
          ))}
        </div>
      </section>

      <section className="thesis-section" aria-label="Energon OS product thesis">
        <div className="thesis-mark" aria-hidden="true">
          <LockKeyhole size={30} />
        </div>
        <p>A vector database retrieves similar text. Energon OS retrieves allowed context.</p>
        <div className="thesis-meta">
          <span>
            <ScanSearch size={16} aria-hidden="true" />
            Permission-aware retrieval
          </span>
          <span>agent_private to shared only by explicit promotion</span>
        </div>
      </section>

      <footer className="footer">
        <p>{site.name}: memory and context infrastructure for AI-native companies.</p>
        <nav aria-label="Footer links">
          <Link href="/llms.txt">llms.txt</Link>
          <Link href="/llms-full.txt">llms-full.txt</Link>
          <Link href="/dashboard">Dashboard</Link>
        </nav>
      </footer>
    </main>
  );
}
