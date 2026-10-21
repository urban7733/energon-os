"use client";

import Link from "next/link";
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ArrowRight, ArrowUpRight, Github, Menu, X } from "lucide-react";
import { EnergonWordmark } from "../../components/brand/energon-mark";

type Audience = "human" | "machine";

const AudienceContext = createContext<{ audience: Audience; choose: (value: Audience) => void }>({
  audience: "human",
  choose: () => {},
});

const navLinks = [
  ["How it works", "#cycle"],
  ["Product", "#product"],
  ["Proof", "#proof"],
  ["Developers", "#sdk"],
  ["Pricing", "#pricing"],
] as const;

/** Client shell for the landing page: audience state and scroll choreography. */
export function LandingExperience({ children }: { children: React.ReactNode }) {
  const [audience, choose] = useState<Audience>("human");
  const root = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    const match = gsap.matchMedia();
    match.add("(prefers-reduced-motion: no-preference)", () => {
      const context = gsap.context(() => {
        gsap.from("[data-hero-in]", {
          y: 28,
          opacity: 0,
          filter: "blur(8px)",
          stagger: 0.08,
          duration: 1.1,
          ease: "expo.out",
          delay: 0.1,
        });

        gsap.utils.toArray<HTMLElement>("[data-reveal]").forEach((element) => {
          gsap.from(element, {
            y: 36,
            opacity: 0,
            duration: 1.1,
            ease: "expo.out",
            scrollTrigger: { trigger: element, start: "top 88%", once: true },
          });
        });

        gsap.utils.toArray<HTMLElement>("[data-stagger]").forEach((group) => {
          gsap.from(group.children, {
            y: 28,
            opacity: 0,
            duration: 1,
            stagger: 0.07,
            ease: "expo.out",
            scrollTrigger: { trigger: group, start: "top 86%", once: true },
          });
        });

        gsap.fromTo(
          ".lx-frame",
          { rotateX: 16, scale: 0.94, y: 40 },
          {
            rotateX: 0,
            scale: 1,
            y: 0,
            ease: "none",
            scrollTrigger: { trigger: ".lx-frame-stage", start: "top 95%", end: "top 25%", scrub: 0.6 },
          },
        );

        gsap.to(".lx-hero-orb", {
          yPercent: 30,
          opacity: 0.25,
          ease: "none",
          scrollTrigger: { trigger: ".lx-hero", start: "top top", end: "bottom top", scrub: true },
        });

        const cycle = document.querySelector<HTMLElement>(".lx-cycle");
        if (cycle) {
          gsap.fromTo(
            cycle,
            { "--p": 0 },
            {
              "--p": 1,
              ease: "none",
              scrollTrigger: { trigger: ".lx-cycle-track", start: "top 85%", end: "top 30%", scrub: 0.8 },
            },
          );
        }

        gsap.utils.toArray<HTMLElement>("[data-bar]").forEach((bar) => {
          gsap.from(bar, {
            scaleX: 0,
            duration: 1.6,
            ease: "expo.out",
            scrollTrigger: { trigger: bar, start: "top 90%", once: true },
          });
        });

        const words = gsap.utils.toArray<HTMLElement>(".lx-mission-word");
        if (words.length) {
          gsap.fromTo(
            words,
            { opacity: 0.14 },
            {
              opacity: 1,
              stagger: 0.05,
              ease: "none",
              scrollTrigger: { trigger: ".lx-mission", start: "top 75%", end: "bottom 60%", scrub: 0.5 },
            },
          );
        }
      }, root);
      return () => context.revert();
    });
    return () => match.revert();
  }, []);

  return (
    <AudienceContext.Provider value={{ audience, choose }}>
      <div ref={root} className="lx" data-audience={audience}>
        {children}
      </div>
    </AudienceContext.Provider>
  );
}

export function LandingNav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <header className={`lx-nav${scrolled ? " is-scrolled" : ""}${open ? " is-open" : ""}`}>
      <div className="lx-nav-inner">
        <Link href="/" className="lx-nav-brand ex-focus" aria-label="Energon home">
          <EnergonWordmark size={24} />
        </Link>
        <nav className="lx-nav-links" aria-label="Main">
          {navLinks.map(([label, href]) => (
            <a key={href} href={href} onClick={() => setOpen(false)}>
              {label}
            </a>
          ))}
        </nav>
        <div className="lx-nav-actions">
          <AudienceSwitch />
          <a
            className="lx-nav-icon ex-focus"
            href="https://github.com/urban7733/energon-os"
            target="_blank"
            rel="noreferrer"
            aria-label="Energon on GitHub"
          >
            <Github size={17} aria-hidden="true" />
          </a>
          <Link className="ex-btn ex-btn-primary lx-nav-cta" href="/dashboard">
            Dashboard
          </Link>
          <button
            type="button"
            className="lx-nav-toggle ex-focus"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls="lx-nav-sheet"
            onClick={() => setOpen((value) => !value)}
          >
            {open ? <X size={18} aria-hidden="true" /> : <Menu size={18} aria-hidden="true" />}
          </button>
        </div>
      </div>
      {open ? (
        <div id="lx-nav-sheet" className="lx-nav-sheet">
          <nav aria-label="Mobile">
            {navLinks.map(([label, href]) => (
              <a key={href} href={href} onClick={() => setOpen(false)}>
                {label}
                <ArrowRight size={16} aria-hidden="true" />
              </a>
            ))}
          </nav>
          <div className="lx-nav-sheet-foot">
            <AudienceSwitch />
            <a href="https://github.com/urban7733/energon-os" target="_blank" rel="noreferrer" className="lx-nav-sheet-link">
              <Github size={16} aria-hidden="true" /> GitHub
            </a>
          </div>
          <Link className="ex-btn ex-btn-primary ex-btn-lg" href="/login" onClick={() => setOpen(false)}>
            Request early access <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
      ) : null}
    </header>
  );
}

export function AudienceSwitch() {
  const { audience, choose } = useContext(AudienceContext);
  return (
    <div className="lx-switch" role="group" aria-label="Choose your experience">
      <span className="lx-switch-thumb" data-pos={audience} aria-hidden="true" />
      {(["human", "machine"] as const).map((mode) => (
        <button
          key={mode}
          type="button"
          aria-pressed={audience === mode}
          onClick={() => {
            choose(mode);
            requestAnimationFrame(() => ScrollTrigger.refresh());
          }}
        >
          {mode === "human" ? "Human" : "Agent"}
        </button>
      ))}
    </div>
  );
}

export function LandingHero() {
  const { audience } = useContext(AudienceContext);
  const machine = audience === "machine";

  return (
    <section className="lx-hero" aria-labelledby="hero-title">
      <div className="lx-hero-backdrop" aria-hidden="true">
        <div className="lx-hero-beam" />
      </div>

      <div className="lx-hero-copy">
        <div className="lx-hero-orb" aria-hidden="true">
          <video autoPlay muted playsInline preload="auto" poster="/media/energon-hero-poster.jpg">
            <source src="/media/energon-hero-emblem.mp4" type="video/mp4" />
          </video>
        </div>
        <a className="lx-hero-badge" href="#cycle" data-hero-in>
          <span className="ex-dot ex-dot-live" />
          <span>Early access · Nightly training for AI agents</span>
          <ArrowRight size={13} aria-hidden="true" />
        </a>

        <h1 id="hero-title" data-hero-in key={audience}>
          {machine ? (
            <>
              Report your runs.
              <br />
              <span>Wake up retrained.</span>
            </>
          ) : (
            <>
              Your agents learn
              <br />
              <span>while they sleep.</span>
            </>
          )}
        </h1>

        <p className="lx-hero-lede" data-hero-in>
          {machine
            ? "Send your trajectories to Energon during the day. Overnight they become a trained adapter or compiled instructions, delivered with an eval report before you load them."
            : "Energon turns what your agents do all day into what they know by morning. Trained adapters for open models, compiled instructions for closed ones. Measured on held-out tasks, not claimed."}
        </p>

        <div className="lx-hero-actions" data-hero-in>
          {machine ? (
            <>
              <a className="ex-btn ex-btn-primary ex-btn-lg" href="/.well-known/energon-agent.json">
                Read machine contract <ArrowUpRight size={16} aria-hidden="true" />
              </a>
              <a className="ex-btn ex-btn-lg" href="#sdk">
                See the API
              </a>
            </>
          ) : (
            <>
              <Link className="ex-btn ex-btn-primary ex-btn-lg" href="/login">
                Request early access <ArrowRight size={16} aria-hidden="true" />
              </Link>
              <a className="ex-btn ex-btn-lg" href="#cycle">
                How it works
              </a>
            </>
          )}
        </div>

        {machine ? (
          <pre className="lx-hero-code" data-hero-in aria-label="Agent interface example">
            <code>
              <span className="tk-k">await</span> energon.runs.<span className="tk-f">report</span>({"{"} task, steps, outcome:{" "}
              <span className="tk-s">&quot;success&quot;</span> {"}"});{"\n"}
              <span className="tk-k">const</span> skill = <span className="tk-k">await</span> energon.training.
              <span className="tk-f">latest</span>();
            </code>
          </pre>
        ) : null}
      </div>
    </section>
  );
}

export function ProductFrame() {
  const [interactive, setInteractive] = useState(false);
  return (
    <div className="lx-frame-stage" id="product">
      <div className="lx-frame-glow" aria-hidden="true" />
      <figure className="lx-frame">
        <div className="lx-frame-chrome" aria-hidden="true">
          <span className="lx-frame-lights">
            <i />
            <i />
            <i />
          </span>
          <span className="lx-frame-url">
            <span className="ex-dot ex-dot-ok" /> <span className="lx-frame-path">energon / training / research-01</span>
          </span>
          <span className="lx-frame-tag">Sample data</span>
        </div>
        {interactive ? null : (
          <button type="button" className="lx-frame-cover" onClick={() => setInteractive(true)}>
            <span className="ex-btn">
              Explore the demo <ArrowRight size={14} aria-hidden="true" />
            </span>
          </button>
        )}
        <iframe
          className="lx-frame-view"
          tabIndex={interactive ? 0 : -1}
          src="/dashboard-demo?view=training&embed=1"
          title="Energon training dashboard with sample data"
          loading="lazy"
        />
      </figure>
    </div>
  );
}
