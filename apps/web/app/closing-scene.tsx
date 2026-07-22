"use client";

import { useLayoutEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

export function ClosingScene() {
  const sectionRef = useRef<HTMLElement>(null);
  const eyebrowRef = useRef<HTMLParagraphElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const statementRef = useRef<HTMLParagraphElement>(null);

  useLayoutEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    gsap.registerPlugin(ScrollTrigger);

    const context = gsap.context(() => {
      gsap
        .timeline({
          scrollTrigger: {
            trigger: sectionRef.current,
            start: "top 82%",
            end: "bottom 26%",
            scrub: 1.25,
            invalidateOnRefresh: true,
          },
        })
        .fromTo(
          eyebrowRef.current,
          { autoAlpha: 0, y: 42 },
          { autoAlpha: 1, y: -12, ease: "none" },
          0,
        )
        .fromTo(
          titleRef.current,
          { autoAlpha: 0, y: 72 },
          { autoAlpha: 1, y: -22, ease: "none" },
          0.1,
        )
        .fromTo(
          statementRef.current,
          { autoAlpha: 0, y: 50 },
          { autoAlpha: 1, y: -16, ease: "none" },
          0.2,
        );
    }, sectionRef);

    return () => context.revert();
  }, []);

  return (
    <section className="closing-scene" ref={sectionRef} aria-labelledby="closing-scene-title">
      <div className="closing-scene-content">
        <p className="closing-scene-kicker" ref={eyebrowRef}>
          Memory, with boundaries.
        </p>
        <h2 id="closing-scene-title" ref={titleRef}>
          Energon OS
        </h2>
        <p className="closing-scene-statement" ref={statementRef}>
          The infrastructure for agentic swarms.
        </p>
      </div>
    </section>
  );
}
