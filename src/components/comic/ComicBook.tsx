"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import type { ArtStyleId } from "@/lib/artStyles";
import { Comic } from "./Comic";
import type { PageView } from "./pageView";
import type { PanelView } from "./view";
import styles from "./book.module.css";

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
/** A horizontal swipe at least this long (px), and clearly more sideways than down, turns the page. */
const SWIPE_PX = 56;

export interface BookPage {
  page: PageView;
  panels: PanelView[];
}

interface ComicBookProps {
  pages: BookPage[];
  style: ArtStyleId;
  label: string;
  /** Arabic comics turn right to left, like an Arabic book. */
  rtl?: boolean;
}

type Turn = { from: number; dir: "forward" | "back" };

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

/**
 * A comic of one to three pages, read one page at a time. The outgoing page
 * swings away from the spine like a printed leaf, shading as it turns, while
 * the next page inks in underneath. Turn with the buttons, the arrow keys or a
 * swipe. A one-page comic is just the page.
 */
export function ComicBook({ pages, style, label, rtl = false }: ComicBookProps) {
  const [current, setCurrent] = useState(0);
  const [turn, setTurn] = useState<Turn | null>(null);
  const bookRef = useRef<HTMLElement>(null);
  const swipe = useRef<{ x: number; y: number; id: number } | null>(null);
  const count = pages.length;

  const goTo = useCallback(
    (to: number) => {
      if (to < 0 || to >= count || to === current) return;
      const reduce = window.matchMedia(REDUCED_MOTION).matches;
      setTurn(reduce ? null : { from: current, dir: to > current ? "forward" : "back" });
      setCurrent(to);
      // Bring the top of the new page into view if the reader had scrolled down the old one.
      const book = bookRef.current;
      if (book && book.getBoundingClientRect().top < 0) book.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    },
    [count, current],
  );

  // Arrow keys turn the page (mirrored for right-to-left comics).
  useEffect(() => {
    if (count < 2) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || isTyping(event.target)) return;
      if (document.querySelector("dialog[open]")) return;
      const forwardKey = rtl ? "ArrowLeft" : "ArrowRight";
      const backKey = rtl ? "ArrowRight" : "ArrowLeft";
      if (event.key === forwardKey) goTo(current + 1);
      else if (event.key === backKey) goTo(current - 1);
      else return;
      event.preventDefault();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [count, current, goTo, rtl]);

  // Links to "#panel-7" (the face-fix note) open the page that panel is on.
  useEffect(() => {
    if (count < 2) return;
    const follow = () => {
      const match = /^#panel-(\d+)$/.exec(window.location.hash);
      if (!match) return;
      const index = Number(match[1]) - 1;
      const at = pages.findIndex((p) => p.panels.some((panel) => panel.index === index));
      if (at === -1) return;
      setTurn(null);
      setCurrent(at);
      requestAnimationFrame(() => document.getElementById(`panel-${index + 1}`)?.scrollIntoView({ block: "center" }));
    };
    follow();
    window.addEventListener("hashchange", follow);
    return () => window.removeEventListener("hashchange", follow);
  }, [count, pages]);

  const onPointerDown = (event: PointerEvent) => {
    if (event.pointerType === "mouse") return;
    swipe.current = { x: event.clientX, y: event.clientY, id: event.pointerId };
  };
  const onPointerUp = (event: PointerEvent) => {
    const start = swipe.current;
    swipe.current = null;
    if (!start || start.id !== event.pointerId) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) < SWIPE_PX || Math.abs(dx) < Math.abs(dy) * 1.6) return;
    const towardNext = rtl ? dx > 0 : dx < 0;
    goTo(current + (towardNext ? 1 : -1));
  };

  if (count === 0) return null;
  if (count === 1) return <Comic panels={pages[0].panels} page={pages[0].page} style={style} label={label} />;

  const shown = pages[current];
  const leaving = turn ? pages[turn.from] : null;

  return (
    <section ref={bookRef} className={styles.book} aria-roledescription="comic book" aria-label={label} data-rtl={rtl || undefined}>
      <header className={styles.head}>
        <p className={styles.folio} aria-live="polite">
          Page <strong>{current + 1}</strong> of {count}
        </p>
        <ol className={styles.dots} aria-label="Pages">
          {pages.map((_, i) => (
            <li key={i}>
              <button
                type="button"
                className={styles.dot}
                aria-current={i === current ? "page" : undefined}
                aria-label={`Page ${i + 1}`}
                onClick={() => goTo(i)}
              />
            </li>
          ))}
        </ol>
      </header>

      <div className={styles.leaves} onPointerDown={onPointerDown} onPointerUp={onPointerUp} onPointerCancel={() => (swipe.current = null)}>
        <div key={current} className={styles.leaf} data-arriving={turn ? turn.dir : undefined}>
          <Comic panels={shown.panels} page={shown.page} style={style} label={`${label}, page ${current + 1} of ${count}`} />
        </div>
        {leaving && turn ? (
          <div
            key={`turn-${turn.from}-${current}`}
            className={styles.turning}
            data-dir={turn.dir}
            aria-hidden="true"
            inert
            onAnimationEnd={(event) => {
              if (event.target === event.currentTarget) setTurn(null);
            }}
          >
            <Comic panels={leaving.panels} page={leaving.page} style={style} label="" still />
          </div>
        ) : null}
      </div>

      <nav className={styles.nav} aria-label="Turn the page">
        <button type="button" className="btn btn--ghost" onClick={() => goTo(current - 1)} disabled={current === 0}>
          <span aria-hidden="true">{rtl ? "→" : "←"}</span> Previous page
        </button>
        <button type="button" className="btn btn--accent" onClick={() => goTo(current + 1)} disabled={current === count - 1}>
          Next page <span aria-hidden="true">{rtl ? "←" : "→"}</span>
        </button>
      </nav>
    </section>
  );
}
