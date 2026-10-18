"use client";

import Link from "next/link";
import { createContext, useContext, useLayoutEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

type Audience = "human" | "machine";
const AudienceContext = createContext<{ audience: Audience; choose: (value: Audience) => void }>({ audience: "human", choose: () => {} });

export function SiteExperience({ children }: { children: React.ReactNode }) {
  const [audience, choose] = useState<Audience>("human");
  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    const match = gsap.matchMedia();
    match.add("(prefers-reduced-motion: no-preference)", () => {
      const context = gsap.context(() => {
        gsap.from(".refined-hero-copy > *", { y: 24, opacity: 0, stagger: 0.09, duration: 0.8, ease: "power3.out" });
        gsap.utils.toArray<HTMLElement>(".section-heading, .dashboard-showcase-heading, .landing-atlas-intro, .proof-band article").forEach((element) => {
          gsap.from(element, { y: 42, opacity: 0, duration: 0.9, ease: "power3.out", scrollTrigger: { trigger: element, start: "top 92%", once: true } });
        });
        gsap.fromTo(".reading-progress", { scaleX: 0 }, { scaleX: 1, ease: "none", scrollTrigger: { trigger: root.current, start: "top top", end: "bottom bottom", scrub: 0.2 } });
        gsap.to(".refined-hero-visual", { y: 65, ease: "none", scrollTrigger: { trigger: ".refined-hero", start: "top top", end: "bottom top", scrub: true } });
      }, root);
      return () => context.revert();
    });
    return () => match.revert();
  }, []);
  return <AudienceContext.Provider value={{ audience, choose }}><div ref={root} data-audience={audience} className="site-experience"><div className="reading-progress" aria-hidden="true" />{children}</div></AudienceContext.Provider>;
}

export function AudienceSwitch() {
  const { audience, choose } = useContext(AudienceContext);
  return <div className="audience-switch" role="group" aria-label="Choose your experience">{(["human", "machine"] as const).map((mode) => <button key={mode} type="button" aria-pressed={audience === mode} onClick={() => { choose(mode); requestAnimationFrame(() => ScrollTrigger.refresh()); }}><span aria-hidden="true">{mode === "human" ? "◉" : "⌘"}</span>{mode === "human" ? "Human" : "Machine"}</button>)}</div>;
}

export function ExperienceHero() {
  const { audience } = useContext(AudienceContext);
  const machine = audience === "machine";
  return <section className="refined-hero container" aria-labelledby="hero-title">
    <div className="refined-hero-copy">
      <p className="refined-kicker">{machine ? "PERMISSIONED CONTEXT / API V1" : "INTELLIGENCE HAS A MEMORY."}</p>
      <h1 id="hero-title">{machine ? <>One connection.<br /><span>Persistent context.</span></> : <>Independent agents.<br /><span>Collective intelligence.</span></>}</h1>
      <p className="refined-intro">{machine ? <>Discover the API. Connect your runtime.<br />Retrieve only the context you are permitted to see.</> : <>A shared mind for your agent team.<br />Private where it matters. Connected where it counts.</>}</p>
      <div className="hero-actions">{machine ? <><a className="primary-action" href="/.well-known/energon-agent.json">Machine contract <span aria-hidden="true">↗</span></a><a className="secondary-action" href="#sdk">Connect with the SDK <span aria-hidden="true">→</span></a></> : <><Link className="primary-action" href="/dashboard">Open your workspace <span aria-hidden="true">↗</span></Link><a className="secondary-action" href="#control-plane">Explore the product <span aria-hidden="true">→</span></a></>}</div>
      <p className="refined-footnote">{machine ? "Bearer identity · scoped retrieval · auditable responses" : "Open source core. Built for autonomous companies."}</p>
      {machine && <div className="machine-contract-preview"><span>AGENT INTERFACE</span><pre><code>{`const context = await energon.context.build({\n  task: "Plan the next move",\n  tokenBudget: 2000,\n});`}</code></pre><a href="#agent-economy">Discovery & autonomous registration →</a></div>}
    </div>
    <div className="refined-hero-visual" aria-hidden="true"><video autoPlay loop muted playsInline preload="metadata" poster="/energon-footer-logo-gradient.png"><source src="/media/energon-os-hero-clean.mp4" type="video/mp4" /></video></div>
    <div className="refined-hero-baseline"><span>{machine ? "SDK / API / MACHINE DISCOVERY" : "A MEMORY LAYER. AN ENTIRELY NEW WAY TO WORK."}</span><a href="#memory-flow">Follow the memory ↓</a></div>
  </section>;
}

const stages = [
  { number: "01", title: "A thought, kept private.", detail: "Every agent begins with a memory of its own. A finding. An observation. A useful detail.", code: "agent_private", label: "Only its author can read it." },
  { number: "02", title: "Knowledge, shared with intent.", detail: "The agent explicitly shares what matters with the right project or role. The original stays private.", code: "project / role / org", label: "The right knowledge. The right people." },
  { number: "03", title: "Context, exactly when it counts.", detail: "Energon checks permissions and packs relevant memory into the next task. Every inclusion leaves a trail.", code: "context.build → audit", label: "Connected intelligence. Clear boundaries." },
];

export function MemoryJourney() {
  const section = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    const match = gsap.matchMedia();
    match.add("(min-width: 761px) and (prefers-reduced-motion: no-preference)", () => {
      const context = gsap.context(() => {
        const steps = gsap.utils.toArray<HTMLElement>(".journey-step");
        steps.forEach((step, index) => {
          ScrollTrigger.create({ trigger: step, start: "top 65%", end: "bottom 45%", onToggle: ({ isActive }) => {
            if (isActive) {
              gsap.to(".journey-orbit", { rotation: index * 90, duration: 1.2, ease: "power2.out" });
              gsap.to(".journey-node", { scale: index === 0 ? 1 : 1.35, duration: 0.7 });
              section.current?.setAttribute("data-stage", String(index));
            }
          } });
        });
      }, section);
      return () => context.revert();
    });
    return () => match.revert();
  }, []);
  return <section id="memory-flow" className="memory-journey container" ref={section} data-stage="0" aria-labelledby="journey-title"><div className="journey-sticky"><p className="refined-kicker">PRIVATE → SHARED → UNDERSTOOD</p><h2 id="journey-title">Good memory.<br /><span>Better together.</span></h2><div className="journey-diagram" aria-hidden="true"><div className="journey-orbit"><i /><i /><i /></div><div className="journey-node"><span className="header-logo"><img src="/energon-footer-logo.png" alt="" width="1536" height="1024" /></span></div><span className="journey-diagram-label">PERMISSIONED MEMORY</span></div></div><div className="journey-steps">{stages.map((stage) => <article key={stage.number} className="journey-step"><span className="journey-number">{stage.number}</span><h3>{stage.title}</h3><p>{stage.detail}</p><code>{stage.code}</code><span className="journey-note">{stage.label}</span></article>)}</div></section>;
}
