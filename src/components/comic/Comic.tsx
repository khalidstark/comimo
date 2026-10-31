"use client";

import { useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import type { ArtStyleId } from "@/lib/artStyles";
import { ComicPanel } from "./Panel";
import type { PageView } from "./pageView";
import type { PanelView } from "./view";
import styles from "./comic.module.css";
import pageStyles from "./page.module.css";

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
/** Gap between panels that come into view together, so they ink in reading order. */
const STAGGER_MS = 170;

const subscribeNothing = () => () => {};

interface ComicProps {
  panels: PanelView[];
  /** Where each panel sits on the page (see pageView). */
  page: PageView;
  style: ArtStyleId;
  label: string;
  /** Show every panel at once with no ink-in (a page that is turning away). */
  still?: boolean;
}

/**
 * The comic page, laid out like a manga page from the day's template. Panels are visible by default (server HTML, no JS, reduced
 * motion, print). Once mounted, panels below the fold are held back and ink in
 * one after another as they scroll into view. Panels already on screen when
 * server HTML hydrates stay put, so nothing blinks; when the comic mounts on
 * the client (a stored day, a page turn) those animate too.
 */
export function Comic({ panels, page, style, label, still = false }: ComicProps) {
  const listRef = useRef<HTMLOListElement>(null);
  // False only while hydrating server HTML.
  const clientRender = useSyncExternalStore(
    subscribeNothing,
    () => true,
    () => false,
  );
  const [animateOnScreen] = useState(clientRender);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (still || !list || !("IntersectionObserver" in window) || window.matchMedia(REDUCED_MOTION).matches) return;

    const frames = Array.from(list.querySelectorAll<HTMLElement>("[data-frame]"));
    const fold = window.innerHeight;
    const held = frames.filter((frame) => {
      const box = frame.getBoundingClientRect();
      const onScreen = box.top < fold && box.bottom > 0;
      return animateOnScreen || !onScreen;
    });
    if (held.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const arriving = entries
          .filter((entry) => entry.isIntersecting)
          .map((entry) => entry.target as HTMLElement)
          .sort((a, b) => Number(a.dataset.frame) - Number(b.dataset.frame));
        arriving.forEach((frame, i) => {
          frame.style.setProperty("--reveal-delay", `${i * STAGGER_MS}ms`);
          frame.dataset.reveal = "play";
          observer.unobserve(frame);
        });
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.2 },
    );
    for (const frame of held) {
      frame.dataset.reveal = "wait";
      observer.observe(frame);
    }
    return () => {
      observer.disconnect();
      for (const frame of held) if (frame.dataset.reveal === "wait") delete frame.dataset.reveal;
    };
  }, [animateOnScreen, panels.length, still]);

  return (
    <div className={`${pageStyles.wrap} ${styles.comic}`} data-style={style} data-template={page.template}>
      <ol ref={listRef} className={pageStyles.page} style={page.vars as CSSProperties} aria-label={label}>
        {panels.map((panel, i) => {
          const slot = page.slots.find((s) => s.index === panel.index) ?? page.slots[i];
          return slot ? <ComicPanel key={panel.index} panel={panel} slot={slot} total={panels.length} /> : null;
        })}
      </ol>
    </div>
  );
}
