"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { spreadsFor, type Spread } from "@/lib/magazine/issue";
import styles from "./flip.module.css";

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
/** Vertical strips each leaf is cut into, so it can bend while it turns. */
const STRIPS = 3;
/** How far the outer strips lead the spine-side ones at mid-turn (degrees per strip). */
const BEND_DEG = 24;
/** A full turn, in ms. */
const TURN_MS = 820;
/** Movement before a press becomes a drag (px). */
const DRAG_START_PX = 10;
/** Share of the turn, or flick speed (px/ms), past which a released drag completes. */
const RELEASE_AT = 0.26;
const FLICK_SPEED = 0.45;
/** A swipe this long turns the page when motion is reduced. */
const SWIPE_PX = 56;

export type PageRole = "live" | "copy";

interface FlipBookProps {
  pageCount: number;
  /** Two pages side by side (desktop) or one at a time (phones). */
  twoUp: boolean;
  /** The view to show (an index into spreadsFor). Changing it plays the turn. */
  view: number;
  /** Called when the reader turns the page by dragging or clicking an edge. */
  onViewChange: (view: number) => void;
  /** Draws one page. "copy" pages sit on a turning leaf: static, hidden from assistive tech. */
  renderPage: (index: number, role: PageRole) => ReactNode;
  label: string;
}

/** A turn between two views: `lo` < `hi`; progress 0 shows `lo`, 1 shows `hi`. */
interface Turn {
  lo: number;
  hi: number;
  /** Lifted from the right edge (forward) or from the left (back). */
  forward: boolean;
  /** Turned by code (keys, buttons, scrubber) rather than held by a finger. */
  auto: boolean;
}

type Drag = { id: number; x: number; y: number; t: number; lastX: number; lastT: number; active: boolean; vx: number };

const prefersReducedMotion = () => typeof window !== "undefined" && window.matchMedia(REDUCED_MOTION).matches;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const easeOut = (t: number) => 1 - (1 - t) ** 3;

/** Light falling on a face turned `deg` from flat: 0 lit, larger is darker. */
function frontShade(deg: number): number {
  return ((1 - Math.cos((deg * Math.PI) / 180)) / 2) * 0.55;
}
function backShade(deg: number): number {
  return ((1 + Math.cos((deg * Math.PI) / 180)) / 2) * 0.55;
}

/** Book offset that centres a lone cover (on the right) or back cover (on the left), as a share of the spread's width. */
function shiftOf(spread: Spread | undefined, twoUp: boolean): number {
  if (!twoUp || !spread) return 0;
  if (spread.left === null) return -25;
  if (spread.right === null) return 25;
  return 0;
}

/**
 * A magazine you can hold: pages sit side by side (or one at a time on a
 * phone) and turn around the spine like printed leaves. The turning leaf is
 * cut into a few vertical strips so it bends as it lifts, each strip shaded
 * by how far it faces away from the light, and it throws a shadow on the page
 * beneath. Drag a page to turn it by hand (it follows the finger and settles
 * or springs back on release), click a page's outer edge, or change `view`
 * from outside (keys, buttons, the scrubber). With reduced motion the next
 * view slides in instead.
 */
export function FlipBook({ pageCount, twoUp, view, onViewChange, renderPage, label }: FlipBookProps) {
  const spreads = useMemo(() => spreadsFor(pageCount, twoUp), [pageCount, twoUp]);
  const last = spreads.length - 1;
  const target = clamp(view, 0, Math.max(0, last));

  const [shown, setShown] = useState(target);
  const [turn, setTurn] = useState<Turn | null>(null);
  const [slide, setSlide] = useState<{ key: number; dir: "forward" | "back" } | null>(null);

  const stageRef = useRef<HTMLDivElement>(null);
  const bookRef = useRef<HTMLDivElement>(null);
  const frontRefs = useRef<(HTMLDivElement | null)[]>([]);
  const backRefs = useRef<(HTMLDivElement | null)[]>([]);
  const shadeRightRef = useRef<HTMLDivElement>(null);
  const shadeLeftRef = useRef<HTMLDivElement>(null);
  const progress = useRef(0);
  const frame = useRef(0);
  const drag = useRef<Drag | null>(null);
  const suppressClick = useRef(false);
  /** The turn whose leaf was last placed, so a re-render mid-turn doesn't restart it. */
  const placed = useRef<Turn | null>(null);

  const settled = clamp(shown, 0, Math.max(0, last));

  // The mode or the issue changed under us (resize, month switch): jump without a turn.
  const layoutKey = `${pageCount}:${twoUp}`;
  const [seenLayout, setSeenLayout] = useState(layoutKey);
  const relaid = seenLayout !== layoutKey;
  if (relaid) {
    setSeenLayout(layoutKey);
    setShown(target);
    setTurn(null);
  }

  /** Put every strip, shadow and the book's offset where `p` (0 to 1) says. */
  const apply = useCallback(
    (p: number, current: Turn) => {
      const stage = stageRef.current;
      if (!stage) return;
      const pageWidth = stage.clientWidth / (twoUp ? 2 : 1);
      const width = pageWidth / STRIPS;
      const bend = BEND_DEG * Math.sin(Math.PI * p);
      const sign = current.forward ? 1 : -1;
      const angles = Array.from({ length: STRIPS }, (_, i) => clamp(-180 * p - sign * i * bend, -180, 0));

      let x = 0;
      let z = 0;
      angles.forEach((deg, i) => {
        const rad = (deg * Math.PI) / 180;
        const lift = 0.6 + i * 0.05; // keeps the leaf just above the page under it
        const place = `translate3d(${x.toFixed(2)}px, 0, ${(z + lift).toFixed(2)}px) rotateY(${deg.toFixed(2)}deg)`;
        const before = i > 0 ? (angles[i - 1] + deg) / 2 : deg;
        const after = i < STRIPS - 1 ? (angles[i + 1] + deg) / 2 : deg;
        const front = frontRefs.current[i];
        if (front) {
          front.style.transform = place;
          front.style.setProperty("--shade-a", frontShade(before).toFixed(3));
          front.style.setProperty("--shade-b", frontShade(after).toFixed(3));
          front.style.setProperty("--gloss", (Math.abs(after - before) / 40).toFixed(3));
        }
        const back = backRefs.current[i];
        if (back) {
          back.style.transform = `${place} translateX(${width.toFixed(2)}px) rotateY(180deg)`;
          back.style.setProperty("--shade-a", backShade(after).toFixed(3));
          back.style.setProperty("--shade-b", backShade(before).toFixed(3));
          back.style.setProperty("--gloss", (Math.abs(after - before) / 40).toFixed(3));
        }
        x += width * Math.cos(rad);
        z += -width * Math.sin(rad);
      });

      // Where the leaf's free edge is, seen from above, as a share of a page width from the spine.
      const reach = x / pageWidth;
      const strength = Math.sin(Math.PI * p);
      if (shadeRightRef.current) {
        shadeRightRef.current.style.setProperty("--edge", `${(Math.max(0, reach) * 100).toFixed(2)}%`);
        shadeRightRef.current.style.setProperty("--alpha", (reach > 0 ? strength * 0.5 : 0).toFixed(3));
      }
      if (shadeLeftRef.current) {
        shadeLeftRef.current.style.setProperty("--edge", `${(Math.max(0, -reach) * 100).toFixed(2)}%`);
        shadeLeftRef.current.style.setProperty("--alpha", (reach < 0 ? strength * 0.5 : 0).toFixed(3));
      }
      if (bookRef.current) {
        const shift = shiftOf(spreads[current.lo], twoUp) * (1 - p) + shiftOf(spreads[current.hi], twoUp) * p;
        bookRef.current.style.setProperty("--shift", `${shift.toFixed(3)}%`);
      }
    },
    [spreads, twoUp],
  );

  const finish = useCallback(
    (to: number) => {
      cancelAnimationFrame(frame.current);
      setTurn(null);
      setShown(to);
      bookRef.current?.style.setProperty("--shift", `${shiftOf(spreads[to], twoUp)}%`);
      if (to !== target) onViewChange(to);
    },
    [onViewChange, spreads, target, twoUp],
  );

  /** Tween the leaf from where it is to `end`, then settle on the view there. */
  const animate = useCallback(
    (current: Turn, end: 0 | 1, duration: number, ease: (t: number) => number) => {
      cancelAnimationFrame(frame.current);
      const start = progress.current;
      const began = performance.now();
      const span = Math.max(180, duration * Math.abs(end - start));
      const step = (now: number) => {
        const t = clamp((now - began) / span, 0, 1);
        progress.current = start + (end - start) * ease(t);
        apply(progress.current, current);
        if (t < 1) frame.current = requestAnimationFrame(step);
        else finish(end === 1 ? current.hi : current.lo);
      };
      frame.current = requestAnimationFrame(step);
    },
    [apply, finish],
  );

  // `view` changed from outside (keys, buttons, the scrubber): turn to it, one leaf even for a jump of several views.
  // A turn started by hand sets `turn` first, so this only reacts once the leaf has settled.
  if (!relaid && !turn && target !== settled) {
    const forward = target > settled;
    if (prefersReducedMotion()) {
      setSlide({ key: (slide?.key ?? 0) + 1, dir: forward ? "forward" : "back" });
      setShown(target);
    } else {
      setTurn({ lo: Math.min(target, settled), hi: Math.max(target, settled), forward, auto: true });
    }
  }

  // Place a fresh leaf before it paints, then play it if code started it.
  useLayoutEffect(() => {
    if (!turn || placed.current === turn) return;
    placed.current = turn;
    if (turn.auto) progress.current = turn.forward ? 0 : 1;
    apply(progress.current, turn);
    if (turn.auto) animate(turn, turn.forward ? 1 : 0, TURN_MS, easeInOut);
  }, [turn, apply, animate]);

  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  // A leaf caught mid-turn by a resize is dropped with it.
  useEffect(() => () => cancelAnimationFrame(frame.current), [layoutKey]);

  /* ---------- Turning by hand ---------- */

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (turn || (event.pointerType === "mouse" && event.button !== 0)) return;
    drag.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      t: event.timeStamp,
      lastX: event.clientX,
      lastT: event.timeStamp,
      active: false,
      vx: 0,
    };
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== event.pointerId) return;
    const dx = event.clientX - d.x;
    const dy = event.clientY - d.y;
    const dt = Math.max(1, event.timeStamp - d.lastT);
    d.vx = (event.clientX - d.lastX) / dt;
    d.lastX = event.clientX;
    d.lastT = event.timeStamp;

    if (!d.active) {
      if (Math.abs(dx) < DRAG_START_PX || Math.abs(dx) < Math.abs(dy) * 1.2) return;
      const forward = dx < 0;
      if ((forward && settled >= last) || (!forward && settled <= 0)) {
        drag.current = null;
        return;
      }
      if (prefersReducedMotion()) return; // decided on release
      d.active = true;
      suppressClick.current = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      progress.current = forward ? 0 : 1;
      setTurn({ lo: forward ? settled : settled - 1, hi: forward ? settled + 1 : settled, forward, auto: false });
      return;
    }

    if (!turn) return;
    const stage = stageRef.current;
    const travel = (stage?.clientWidth ?? 600) * (twoUp ? 0.9 : 1.1);
    progress.current = turn.forward ? clamp(-dx / travel, 0, 1) : clamp(1 - dx / travel, 0, 1);
    apply(progress.current, turn);
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.id !== event.pointerId) return;
    const dx = event.clientX - d.x;

    if (!d.active) {
      // Reduced motion: a plain swipe turns the page with a slide.
      const dy = event.clientY - d.y;
      if (prefersReducedMotion() && Math.abs(dx) >= SWIPE_PX && Math.abs(dx) > Math.abs(dy) * 1.2) {
        suppressClick.current = true;
        const to = clamp(settled + (dx < 0 ? 1 : -1), 0, last);
        if (to !== settled) {
          setSlide({ key: (slide?.key ?? 0) + 1, dir: dx < 0 ? "forward" : "back" });
          setShown(to);
          onViewChange(to);
        }
      }
      return;
    }
    if (!turn) return;
    const p = progress.current;
    const done = turn.forward ? p > RELEASE_AT || d.vx < -FLICK_SPEED : p < 1 - RELEASE_AT || d.vx > FLICK_SPEED;
    const flicked = turn.forward ? d.vx > FLICK_SPEED : d.vx < -FLICK_SPEED;
    const end: 0 | 1 = turn.forward ? (done && !flicked ? 1 : 0) : done && !flicked ? 0 : 1;
    animate(turn, end, TURN_MS * 0.8, easeOut);
  };

  const onPointerCancel = () => {
    const d = drag.current;
    drag.current = null;
    if (d?.active && turn) animate(turn, turn.forward ? 0 : 1, TURN_MS * 0.6, easeOut);
  };

  // A click on a page's outer edge turns it, like reaching for the corner.
  const onClick = (event: MouseEvent<HTMLDivElement>) => {
    if (suppressClick.current) {
      suppressClick.current = false;
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (turn || (event.target as HTMLElement).closest("a, button, input, select, textarea, summary, [role='button']")) return;
    const stage = stageRef.current;
    if (!stage) return;
    const box = stage.getBoundingClientRect();
    const at = (event.clientX - box.left) / box.width;
    const edge = twoUp ? 0.07 : 0.14;
    if (at > 1 - edge && settled < last) onViewChange(settled + 1);
    else if (at < edge && settled > 0) onViewChange(settled - 1);
  };

  /* ---------- Layers ---------- */

  const spread = spreads[settled] ?? { left: null, right: null };
  const under: Spread = turn ? { left: spreads[turn.lo].left, right: spreads[turn.hi].right } : spread;
  const leaf = turn ? { front: spreads[turn.lo].right, back: spreads[turn.hi].left } : null;
  const restingShift = shiftOf(spread, twoUp);

  const side = (index: number | null, where: "left" | "right") => {
    if (index === null) return null;
    return (
      <div key={`page-${index}`} className={styles.page} data-side={twoUp ? where : "single"}>
        {renderPage(index, turn ? "copy" : "live")}
      </div>
    );
  };

  const strip = (index: number | null, i: number, face: "front" | "back") => {
    const offset = face === "front" ? i : STRIPS - 1 - i;
    return (
      <div
        key={`${face}-${i}`}
        ref={(node) => {
          (face === "front" ? frontRefs : backRefs).current[i] = node;
        }}
        className={styles.strip}
        data-face={face}
        style={{ "--strips": STRIPS } as CSSProperties}
      >
        <div
          className={styles.stripInner}
          style={{ marginInlineStart: `${-offset * 100}%` }}
          data-side={twoUp ? (face === "front" ? "right" : "left") : "single"}
        >
          {index === null ? <div className={styles.paperBack} /> : renderPage(index, "copy")}
        </div>
        <div className={styles.light} aria-hidden="true" />
      </div>
    );
  };

  return (
    <div
      className={styles.frame}
      data-two-up={twoUp || undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onClickCapture={onClick}
    >
      <div
        ref={bookRef}
        className={styles.book}
        style={{ "--shift": `${restingShift}%` } as CSSProperties}
        data-turning={turn ? "" : undefined}
      >
        <div
          ref={stageRef}
          className={styles.stage}
          dir="ltr"
          role="group"
          aria-roledescription="magazine"
          aria-label={label}
          data-slide={slide?.dir}
          key={slide ? `slide-${slide.key}` : "stage"}
        >
          {twoUp ? (
            <>
              <div className={styles.slot} data-col="left">
                {side(under.left, "left")}
                {turn ? <div ref={shadeLeftRef} className={styles.castShadow} data-side="left" aria-hidden="true" /> : null}
              </div>
              <div className={styles.slot} data-col="right">
                {side(under.right, "right")}
                {turn ? <div ref={shadeRightRef} className={styles.castShadow} data-side="right" aria-hidden="true" /> : null}
                {!turn && spread.right !== null && settled < last ? <span className={styles.corner} aria-hidden="true" /> : null}
              </div>
            </>
          ) : (
            <div className={styles.slot} data-col="single">
              {side(under.right, "right")}
              {turn ? <div ref={shadeRightRef} className={styles.castShadow} data-side="right" aria-hidden="true" /> : null}
              {!turn && settled < last ? <span className={styles.corner} aria-hidden="true" /> : null}
            </div>
          )}

          {leaf ? (
            <div className={styles.leaf} data-col={twoUp ? "right" : "single"} aria-hidden="true" inert>
              {Array.from({ length: STRIPS }, (_, i) => strip(leaf.front, i, "front"))}
              {Array.from({ length: STRIPS }, (_, i) => strip(leaf.back, i, "back"))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
