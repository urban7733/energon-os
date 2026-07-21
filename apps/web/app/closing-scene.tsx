"use client";

import Image from "next/image";
import { useLayoutEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

export function ClosingScene() {
  const sectionRef = useRef<HTMLElement>(null);
  const imageRef = useRef<HTMLDivElement>(null);
  const eyebrowRef = useRef<HTMLParagraphElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const statementRef = useRef<HTMLParagraphElement>(null);

  useLayoutEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    gsap.registerPlugin(ScrollTrigger);

    const context = gsap.context(() => {
      gsap.to(imageRef.current, {
        scale: 1.04,
        yPercent: -14,
        ease: "none",
        scrollTrigger: {
          trigger: sectionRef.current,
          start: "top bottom",
          end: "bottom top",
          scrub: 1.25,
          invalidateOnRefresh: true,
        },
      });

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
      <div className="closing-scene-media" ref={imageRef} aria-hidden="true">
        <Image
          className="closing-scene-image"
          src="/energonospic.png"
          alt=""
          fill
          sizes="100vw"
          quality={92}
        />
      </div>
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
