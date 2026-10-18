"use client";

import { useLayoutEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

export function ClosingScene() {
  const section = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    gsap.registerPlugin(ScrollTrigger);
    const context = gsap.context(() => {
      gsap.timeline({ scrollTrigger: { trigger: section.current, start: "top 90%", end: "center 45%", scrub: 0.8 } })
        .fromTo(".footer-emblem", { scale: 0.72, y: 80, opacity: 0.2 }, { scale: 1, y: 0, opacity: 1, ease: "none" })
        .fromTo(".footer-brand-caption", { y: 24, opacity: 0 }, { y: 0, opacity: 1, ease: "none" }, 0.35);
    }, section);
    return () => context.revert();
  }, []);
  return (
    <section className="footer-brand-scene" ref={section} aria-label="Energon OS">
      <img className="footer-emblem" src="/energon-footer-logo-gradient.png" alt="Energon emblem with an ice blue rim" width="1536" height="1024" loading="lazy" />
      <div className="footer-brand-caption"><span>ENERGON OS</span><p>Memory, with boundaries.</p></div>
    </section>
  );
}
