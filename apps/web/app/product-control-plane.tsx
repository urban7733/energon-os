"use client";

import Link from "next/link";
import { ArrowUpRight, Eye, GitBranch, ShieldCheck } from "lucide-react";
import MemoryAtlas from "../components/dashboard/memory-atlas";
import {
  demoAgents,
  demoConflicts,
  demoMemories,
  demoRolePolicies,
} from "../lib/demo-workspace";

const graphReasons = [
  {
    icon: Eye,
    number: "01",
    title: "Trace what an agent knows",
    detail: "Follow every memory back to its agent, project, role, and workspace context.",
  },
  {
    icon: ShieldCheck,
    number: "02",
    title: "See permission boundaries",
    detail: "Private and shared records stay visually distinct before context reaches an agent.",
  },
  {
    icon: GitBranch,
    number: "03",
    title: "Find conflicts early",
    detail: "Contested facts stand apart, so operators can resolve them before agents act.",
  },
] as const;

export function ProductControlPlane() {
  return (
    <section id="control-plane" className="dashboard-showcase" aria-labelledby="dashboard-showcase-title">
      <div className="dashboard-showcase-heading">
        <div>
          <p>01 / THE CONTROL PLANE</p>
          <h2 id="dashboard-showcase-title">Everything connected. Nothing exposed.</h2>
          <span>Usage, agents, payments, memory scopes and permission outcomes in one focused view.</span>
        </div>
        <div className="dashboard-showcase-actions dashboard-showcase-actions-single">
          <Link href="/dashboard">
            Open dashboard <ArrowUpRight size={14} aria-hidden="true" />
          </Link>
        </div>
      </div>

      <figure className="dashboard-showcase-frame">
        <div className="dashboard-showcase-chrome" aria-hidden="true">
          <i>ENERGON OS / DEMO WORKSPACE</i>
          <em>SAMPLE DATA</em>
        </div>
        <iframe
          className="dashboard-live-preview"
          src="/dashboard-demo?view=overview"
          title="Interactive Energon dashboard with sample workspace data"
          loading="lazy"
        />
        <figcaption>Interactive dashboard · sample workspace data.</figcaption>
      </figure>

      <section className="landing-atlas" aria-labelledby="landing-atlas-title">
        <div className="landing-atlas-intro">
          <div className="landing-atlas-copy">
            <p>02 / THE KNOWLEDGE GRAPH</p>
            <h2 id="landing-atlas-title">A clearer view of what your agents know.</h2>
            <span>
              A list tells you what exists. The graph shows how company knowledge is connected,
              where access stops, and which fact needs a human decision.
            </span>
          </div>

          <div className="landing-atlas-reasons">
            {graphReasons.map(({ icon: Icon, number, title, detail }) => (
              <article key={number}>
                <div>
                  <span>{number}</span>
                  <Icon size={15} aria-hidden="true" />
                </div>
                <strong>{title}</strong>
                <p>{detail}</p>
              </article>
            ))}
          </div>
        </div>

        <div className="landing-atlas-livebar">
          <span><i aria-hidden="true" /> Live sample workspace</span>
          <span>Drag to rotate · scroll to zoom · select a node</span>
        </div>

        <div className="landing-atlas-shell dashboard-shell">
          <MemoryAtlas
            organizationName="Energon Labs"
            agents={demoAgents}
            memories={demoMemories}
            totalMemories={2847}
            rolePolicies={demoRolePolicies}
            conflicts={demoConflicts}
          />
        </div>

        <p className="landing-atlas-source">
          Inspired by the relationship-first interaction of the{" "}
          <a href="https://obsidian.md/help/plugins/graph" target="_blank" rel="noreferrer">
            Obsidian Graph View <ArrowUpRight size={12} aria-hidden="true" />
          </a>
          — adapted for governed AI memory.
        </p>
      </section>
    </section>
  );
}
