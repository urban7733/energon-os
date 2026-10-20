import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  ChartLine,
  CodeXml,
  Cpu,
  GitBranch,
  Handshake,
  Headset,
  Layers,
  Moon,
  PlugZap,
  Radar,
  ScanEye,
  ShieldCheck,
  Sun,
  Sunrise,
  Terminal,
} from "lucide-react";
import { EnergonMark, EnergonWordmark } from "../components/brand/energon-mark";
import { AtlasShowcase } from "./landing/atlas-showcase";
import { LandingExperience, LandingHero, LandingNav, ProductFrame } from "./landing/experience";
import { SdkQuickstart } from "./sdk-quickstart";
import { paymentRails, pricingPlans, site } from "../lib/site";

const stack = [
  "LoRA adapters for open models",
  "Compiled instructions for Claude · GPT · Gemini",
  "Held-out evals",
  "Permission-aware training",
  "x402 for agents",
  "Open-source core",
];

const cycle = [
  {
    time: "09:00",
    icon: Sun,
    phase: "Day",
    title: "Your agent works.",
    detail: "It runs in your stack as usual and reports each run to Energon: the task, the steps, the outcome.",
  },
  {
    time: "23:00",
    icon: Moon,
    phase: "Night",
    title: "Energon dreams.",
    detail: "Successful runs are kept, failures are studied. Patterns become training data, then a new adapter or new instructions.",
  },
  {
    time: "05:30",
    icon: ChartLine,
    phase: "Proof",
    title: "It has to win.",
    detail: "Every candidate is tested on tasks it never trained on, against yesterday's version. No lift, no release.",
  },
  {
    time: "06:00",
    icon: Sunrise,
    phase: "Morning",
    title: "It wakes up better.",
    detail: "Your agent loads its latest version by API, with the eval report attached. One call, measurably sharper.",
  },
] as const;

const trust = [
  {
    icon: ShieldCheck,
    title: "Learns only what it may see",
    detail: "Training data passes the same permission engine as memory. A private run never trains another agent's model.",
    wide: true,
  },
  {
    icon: Layers,
    title: "One adapter per agent",
    detail: "Every agent gets its own weights. Nothing is blended across agents or customers.",
  },
  {
    icon: ScanEye,
    title: "Every run audited",
    detail: "Which runs trained which version, and which version shipped, stays on record.",
  },
  {
    icon: GitBranch,
    title: "Roll back any night",
    detail: "Versions are immutable. Pin, compare or revert in one call.",
  },
  {
    icon: Cpu,
    title: "Model-agnostic",
    detail: "Adapters where weights are open, compiled instructions where they are not.",
  },
  {
    icon: Radar,
    title: "Built for machines",
    detail: "Agents discover the contract, pay via x402 and train without a human in the loop.",
  },
] as const;

const packs = [
  { icon: Terminal, name: "Linux Operator", detail: "Shell, services, packages, logs.", tags: ["bash", "systemd", "docker"] },
  { icon: CodeXml, name: "Code Reviewer", detail: "Diffs, risks, tests, clear feedback.", tags: ["git", "security", "tests"] },
  { icon: Headset, name: "Support Resolver", detail: "Triage, answers, escalation paths.", tags: ["tickets", "tone", "SLA"] },
  { icon: Handshake, name: "Sales Closer", detail: "Qualification, objections, follow-up.", tags: ["CRM", "email", "pricing"] },
] as const;

const evalRows = [
  { label: "Linux operations", base: 52, compiled: 61, adapter: 74 },
  { label: "Code review", base: 58, compiled: 66, adapter: 71 },
  { label: "Support triage", base: 64, compiled: 73, adapter: 79 },
] as const;

const missionWords =
  "We are building one of the first complete AI-autonomous companies. Its agents should not just remember. They should get better every night, and prove it every morning.".split(" ");

export default function HomePage() {
  return (
    <LandingExperience>
      <LandingNav />

      <main>
        <LandingHero />

        <section className="lx-stack" aria-label="What Energon delivers">
          <div className="lx-stack-track">
            {[...stack, ...stack].map((item, index) => (
              <span key={`${item}-${index}`} aria-hidden={index >= stack.length}>
                <i /> {item}
              </span>
            ))}
          </div>
        </section>

        <section id="cycle" className="lx-section" aria-labelledby="cycle-title">
          <div className="lx-container">
            <header className="lx-heading" data-reveal>
              <p className="ex-eyebrow">The nightly loop</p>
              <h2 id="cycle-title">
                One night.
                <br />
                <span>One better agent.</span>
              </h2>
              <p>Agent in, training on, it knows more by morning. Not stored. Learned.</p>
            </header>

            <div className="lx-cycle" data-reveal>
              <div className="lx-cycle-track" aria-hidden="true">
                <div className="lx-cycle-sky" />
                <div className="lx-cycle-line" />
                <div className="lx-cycle-fill" />
                <div className="lx-cycle-orb" />
                {cycle.map((stop, index) => (
                  <span
                    key={stop.time}
                    className="lx-cycle-tick"
                    style={{ left: `${(index / (cycle.length - 1)) * 100}%` }}
                  >
                    {stop.time}
                  </span>
                ))}
              </div>
              <ol className="lx-cycle-steps">
                {cycle.map(({ icon: Icon, ...stop }) => (
                  <li key={stop.time}>
                    <span className="lx-cycle-icon">
                      <Icon size={16} aria-hidden="true" />
                    </span>
                    <span className="lx-cycle-phase">{stop.phase}</span>
                    <h3>{stop.title}</h3>
                    <p>{stop.detail}</p>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        <section className="lx-section lx-section-tight" aria-labelledby="product-title">
          <div className="lx-container">
            <header className="lx-heading lx-heading-center" data-reveal>
              <p className="ex-eyebrow">The training console</p>
              <h2 id="product-title">
                Every morning,
                <br />
                <span>a report you can trust.</span>
              </h2>
            </header>
          </div>
          <ProductFrame />
        </section>

        <section className="lx-section" aria-labelledby="ways-title">
          <div className="lx-container">
            <header className="lx-heading" data-reveal>
              <p className="ex-eyebrow">Two ways to learn</p>
              <h2 id="ways-title">
                Weights where they are open.
                <br />
                <span>Instructions where they are not.</span>
              </h2>
            </header>

            <div className="lx-ways" data-stagger>
              <article className="lx-way is-weights">
                <div className="lx-way-visual" aria-hidden="true">
                  <div className="lx-model">
                    <span className="lx-model-label">Base model · frozen</span>
                    <div className="lx-model-layers">
                      {Array.from({ length: 6 }, (_, index) => (
                        <i key={index} />
                      ))}
                    </div>
                  </div>
                  <div className="lx-adapter">
                    <PlugZap size={14} />
                    <span>
                      <strong>research-01 · v14</strong>
                      <em>LoRA adapter · trained last night</em>
                    </span>
                  </div>
                </div>
                <div className="lx-way-copy">
                  <span className="lx-way-tag">Open-weight models</span>
                  <h3>Plug in the night&apos;s weights.</h3>
                  <p>
                    Energon trains a small LoRA adapter per agent on its own successful runs. The base model stays
                    untouched. The adapter snaps on top, like loading a skill straight into the agent.
                  </p>
                </div>
              </article>

              <article className="lx-way">
                <div className="lx-way-visual" aria-hidden="true">
                  <pre className="lx-compiled">
                    <code>
                      <span className="tk-c"># compiled for research-01 · night 14</span>
                      {"\n"}
                      <span className="tk-k">rule</span> Check the vendor changelog before quoting prices.
                      {"\n"}
                      <span className="tk-k">rule</span> Escalate contract terms above 50k to the reviewer.
                      {"\n"}
                      <span className="tk-k">avoid</span> Retrying failed API calls more than twice.
                      {"\n"}
                      <span className="tk-f">example</span> 3 best runs from this week
                    </code>
                  </pre>
                </div>
                <div className="lx-way-copy">
                  <span className="lx-way-tag">Claude · GPT · Gemini</span>
                  <h3>Compile what worked.</h3>
                  <p>
                    For closed models, Energon searches instruction variants against your agent&apos;s real runs and keeps
                    only what measurably wins: rules, failure patterns, best examples.
                  </p>
                </div>
              </article>
            </div>
          </div>
        </section>

        <section id="proof" className="lx-section" aria-labelledby="proof-title">
          <div className="lx-container lx-proof">
            <div className="lx-proof-copy" data-reveal>
              <p className="ex-eyebrow">Proof</p>
              <h2 id="proof-title">
                Measured,
                <br />
                <span>not claimed.</span>
              </h2>
              <p>
                Learning is easy to claim and hard to prove. So every version Energon ships has to beat its predecessor on
                tasks it has never seen.
              </p>
              <ul className="lx-checks">
                <li>Held-out tasks, never used for training</li>
                <li>Several runs per variant, spread included</li>
                <li>Control without training, same budget</li>
                <li>No measurable lift, no release</li>
              </ul>
            </div>

            <figure className="lx-eval" data-reveal>
              <header>
                <div>
                  <span className="lx-eval-kicker">Eval report · held-out tasks</span>
                  <strong>Success rate by variant</strong>
                </div>
                <span className="lx-eval-note">Illustrative layout</span>
              </header>
              <div className="lx-eval-legend" aria-hidden="true">
                <span>
                  <i className="v-base" /> Base model
                </span>
                <span>
                  <i className="v-compiled" /> Compiled instructions
                </span>
                <span>
                  <i className="v-adapter" /> Trained adapter
                </span>
              </div>
              <div className="lx-eval-rows">
                {evalRows.map((row) => (
                  <div key={row.label} className="lx-eval-row">
                    <span className="lx-eval-label">{row.label}</span>
                    <div className="lx-eval-bars">
                      {(["base", "compiled", "adapter"] as const).map((variant) => (
                        <div key={variant} className="lx-eval-bar">
                          <span className={`v-${variant}`} style={{ width: `${row[variant]}%` }} data-bar />
                          <em>{row[variant]}%</em>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <figcaption>Your report uses your own agent&apos;s held-out tasks. Numbers shown are an example.</figcaption>
            </figure>
          </div>
        </section>

        <section id="trust" className="lx-section" aria-labelledby="trust-title">
          <div className="lx-container">
            <header className="lx-heading" data-reveal>
              <p className="ex-eyebrow">Your data, your moat</p>
              <h2 id="trust-title">
                Learns from your data.
                <br />
                <span>Leaks none of it.</span>
              </h2>
              <p>
                Hand-written skills can be copied. Skills learned from your own runs cannot. Underneath sits the
                permissioned memory engine Energon started as.
              </p>
            </header>
            <div className="lx-bento" data-stagger>
              {trust.map(({ icon: Icon, title, detail, ...rest }) => (
                <article key={title} className={"wide" in rest && rest.wide ? "lx-tile is-wide" : "lx-tile"}>
                  {"wide" in rest && rest.wide ? <ScopeVisual /> : null}
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

        <section id="atlas" className="lx-section lx-atlas" aria-labelledby="atlas-title">
          <div className="lx-container">
            <header className="lx-heading lx-heading-split" data-reveal>
              <div>
                <p className="ex-eyebrow">The Atlas</p>
                <h2 id="atlas-title">
                  See what each agent
                  <br />
                  <span>is allowed to learn from.</span>
                </h2>
              </div>
              <p>
                Every agent, role, project and memory in one living graph. Private runs stay private, shared knowledge is
                visible, and contested facts wait for a human before they ever reach training.
              </p>
            </header>
            <div className="lx-atlas-stage" data-reveal>
              <AtlasShowcase />
            </div>
          </div>
        </section>

        <section className="lx-section" aria-labelledby="packs-title">
          <div className="lx-container">
            <header className="lx-heading lx-heading-split" data-reveal>
              <div>
                <p className="ex-eyebrow">Starter packs</p>
                <h2 id="packs-title">
                  Start trained.
                  <br />
                  <span>Then learn your way.</span>
                </h2>
              </div>
              <p>
                Day one should already feel different. Starter packs give an agent a strong baseline while its own runs
                accumulate. From night one, it learns from your work, not ours.
              </p>
            </header>
            <div className="lx-packs" data-stagger>
              {packs.map(({ icon: Icon, name, detail, tags }) => (
                <article key={name} className="lx-pack">
                  <span className="lx-pack-icon">
                    <Icon size={18} aria-hidden="true" />
                  </span>
                  <h3>{name}</h3>
                  <p>{detail}</p>
                  <ul>
                    {tags.map((tag) => (
                      <li key={tag}>{tag}</li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="sdk" className="lx-section" aria-labelledby="sdk-title">
          <div className="lx-container lx-sdk">
            <div className="lx-sdk-copy" data-reveal>
              <p className="ex-eyebrow">Developers</p>
              <h2 id="sdk-title">
                Two calls.
                <br />
                <span>Every night.</span>
              </h2>
              <p>
                Report what your agent did. Load what it learned. Energon handles the training, the evals and the
                versioning in between.
              </p>
              <ul className="lx-checks">
                <li>Works with your existing agent runtime</li>
                <li>Server-side keys, identity per agent</li>
                <li>Every version pinned, compared, reversible</li>
              </ul>
              <div className="lx-hero-actions">
                <a className="ex-btn" href={site.documentationUrl} target="_blank" rel="noreferrer">
                  Documentation <ArrowUpRight size={14} aria-hidden="true" />
                </a>
                <a className="ex-btn" href={site.repositoryUrl} target="_blank" rel="noreferrer">
                  GitHub <ArrowUpRight size={14} aria-hidden="true" />
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
              <h2 id="pricing-title">Pay per agent that gets better.</h2>
              <p>Start free. Upgrade when the eval report earns it.</p>
            </header>
            <div className="lx-pricing" data-stagger>
              {pricingPlans.map((plan) => (
                <article key={plan.name} className={plan.name === "Pro" ? "lx-plan is-featured" : "lx-plan"}>
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
            Plug in. Sleep.
            <br />
            <span>Wake up better.</span>
          </h2>
          <div className="lx-hero-actions">
            <Link className="ex-btn ex-btn-primary ex-btn-lg" href="/login">
              Request early access <ArrowRight size={16} aria-hidden="true" />
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
            <p>Your agents learn while they sleep.</p>
          </div>
          <nav aria-label="Product">
            <h4>Product</h4>
            <a href="#cycle">How it works</a>
            <a href="#proof">Evals</a>
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
            <EnergonMark size={14} /> © {new Date().getFullYear()} Energon
          </span>
          <span>Plug in. Sleep. Wake up better.</span>
        </div>
      </footer>
    </LandingExperience>
  );
}

function ScopeVisual() {
  const rows = [
    ["run · research-01 · pricing check", true],
    ["run · sales-02 · objection handling", false],
    ["memory · project launch · rollout plan", true],
    ["memory · agent_private · sales-02", false],
    ["run · research-01 · vendor audit", true],
  ] as const;
  return (
    <div className="lx-tile-visual tv-filter" aria-hidden="true">
      {rows.map(([row, allowed]) => (
        <div key={row} className={allowed ? "" : "is-denied"}>
          <i />
          <span>{row}</span>
          <em>{allowed ? "trains research-01" : "excluded"}</em>
        </div>
      ))}
    </div>
  );
}
