"use client";

// Smooth scrolling (Lenis) and the scroll reveals for the story pages:
//   [data-reveal]           lifts and fades in once, as it scrolls into view
//   [data-reveal="stagger"] the same for each direct child, a beat apart
//   [data-parallax="8"]     drifts against the scroll inside its parent (percent of its height)
// Nothing is hidden without script, anything already on screen is left alone, and reduced
// motion gets the plain page. The smooth scroll holds still while the ink transition covers
// the page (html.inking). Mount it once per page that wants it; it cleans up when the page is
// hidden (Next keeps hidden pages in an Activity, so every effect must undo itself).

import { useEffect } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import "lenis/dist/lenis.css";

export function SmoothScroll() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    gsap.registerPlugin(ScrollTrigger);
    const root = document.documentElement;

    const lenis = new Lenis({ lerp: 0.09, wheelMultiplier: 0.95, smoothWheel: true, anchors: { offset: -80 } });
    lenis.on("scroll", ScrollTrigger.update);
    const tick = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);

    const ctx = gsap.context(() => {
      const from = { y: 28, opacity: 0 };
      const to = { y: 0, opacity: 1, duration: 0.75, ease: "power3.out" };
      gsap.utils.toArray<HTMLElement>("[data-reveal]").forEach((el) => {
        if (el.getBoundingClientRect().top < window.innerHeight * 0.92) return; // already in view
        const targets = el.dataset.reveal === "stagger" ? Array.from(el.children) : [el];
        gsap.fromTo(targets, from, {
          ...to,
          stagger: 0.07,
          clearProps: "transform,opacity",
          scrollTrigger: { trigger: el, start: "top 88%", once: true },
        });
      });
      gsap.utils.toArray<HTMLElement>("[data-parallax]").forEach((el) => {
        const amount = Number(el.dataset.parallax) || 8;
        gsap.fromTo(
          el,
          { yPercent: amount },
          {
            yPercent: -amount,
            ease: "none",
            scrollTrigger: { trigger: el.parentElement ?? el, start: "top bottom", end: "bottom top", scrub: true },
          },
        );
      });
    });

    // Late images and fonts move things down; measure again once the page has settled.
    const refresh = window.setTimeout(() => ScrollTrigger.refresh(), 1200);

    // Leaving through the ink: hold the page still behind it.
    const inking = new MutationObserver(() => {
      if (root.classList.contains("inking")) lenis.stop();
      else lenis.start();
    });
    inking.observe(root, { attributes: true, attributeFilter: ["class"] });

    return () => {
      window.clearTimeout(refresh);
      inking.disconnect();
      ctx.revert();
      gsap.ticker.remove(tick);
      gsap.ticker.lagSmoothing(500, 33);
      lenis.destroy();
    };
  }, []);

  return null;
}
