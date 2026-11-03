"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { drawSequence, frameAt, frameUrls, loadSequence, type Sequence } from "@/lib/motion/sequence";
import styles from "./ScrollFilm.module.css";

/** How far (in film progress) a chapter takes to arrive or leave. */
const FADE = 0.08;
/** A chapter without data-until stays this long after data-at. */
const HOLD = 0.12;
/** The live (scrubbed) film; anything else gets the posters. Mirrors the CSS gate. */
const LIVE = "(prefers-reduced-motion: no-preference) and (scripting: enabled)";

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (x: number) => x * x * (3 - 2 * x);

export interface ScrollFilmProps {
  /** Frames in public/media/<dir>/000.webp ... */
  dir: string;
  count: number;
  /** Section height in viewport heights; the film plays over (length - 1) screens of scrolling. */
  length?: number;
  /** Focal point of the frames (0..1, like object-position) kept in view when the screen crops them. */
  focus?: [number, number];
  /**
   * Progress range over which a portrait screen eases from cropping the frame (cover) to showing
   * all of it (contain), letterboxed in the frame's own edge colour. For a film that ends on a
   * page that should be seen whole.
   */
  containFrom?: [number, number];
  /** Progress range over which the film settles into the page's own paper (dark theme hand-over). */
  settle?: [number, number];
  /** Alt text for the reduced-motion stills; empty keeps them decorative. */
  stillAlt?: [string, string];
  label: string;
  className?: string;
  /**
   * Chapters: elements with data-at (progress 0..1 where they arrive) and optional data-until
   * (where they start to leave). They fade and lift with the film instead of popping.
   */
  children: ReactNode;
}

/**
 * A scroll-scrubbed film: a sticky, full-screen canvas inside a tall section; the section's scroll
 * position picks the frame. Text is ordinary HTML laid over it. Reduced motion (and no script)
 * gets the first frame as a still, the chapters in reading order and the last frame below them.
 */
export function ScrollFilm({
  dir,
  count,
  length = 2.6,
  focus = [0.5, 0.5],
  containFrom,
  settle,
  stillAlt = ["", ""],
  label,
  className,
  children,
}: ScrollFilmProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chaptersRef = useRef<HTMLDivElement>(null);
  const urls = frameUrls(dir, count);
  const [fx, fy] = focus;
  const [c0, c1] = containFrom ?? [2, 3];
  const [s0, s1] = settle ?? [2, 3];

  useEffect(() => {
    const section = sectionRef.current;
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    const chapterBox = chaptersRef.current;
    if (!section || !stage || !canvas || !chapterBox) return;
    const live = window.matchMedia(LIVE);
    if (!live.matches) return;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    const urls = frameUrls(dir, count);
    const chapters = Array.from(chapterBox.children).filter((el): el is HTMLElement => el instanceof HTMLElement && "at" in el.dataset);
    const windows = chapters.map((el) => {
      const at = Number(el.dataset.at) || 0;
      const until = el.dataset.until !== undefined ? Number(el.dataset.until) : at + HOLD;
      return { el, at, until, on: at <= 0 };
    });

    let seq: Sequence | null = null;
    let raf = 0;
    let onScreen = true;
    let stickTop = 0;
    let paper = "";
    let last = { p: -1, w: 0, h: 0, ready: -1, drew: false };

    const measure = () => {
      stickTop = parseFloat(getComputedStyle(stage).top) || 0;
      paper = getComputedStyle(section).getPropertyValue("--paper").trim();
      last = { ...last, p: -1 };
    };
    measure();

    const progress = () => {
      const box = section.getBoundingClientRect();
      const run = box.height - stage.offsetHeight;
      return run > 0 ? clamp01((stickTop - box.top) / run) : 0;
    };

    const placeChapters = (p: number) => {
      for (const w of windows) {
        const arrive = smooth(clamp01((p - (w.at - FADE)) / FADE));
        const leave = smooth(clamp01((w.until + FADE - p) / FADE));
        const v = Math.min(arrive, leave);
        const shift = v >= 1 ? 0 : p < w.at ? 1 - v : -(1 - v);
        w.el.style.setProperty("--v", v.toFixed(3));
        w.el.style.setProperty("--shift", shift.toFixed(3));
        const on = v > 0.5;
        if (on !== w.on || !w.el.dataset.state) {
          w.on = on;
          w.el.dataset.state = on ? "on" : "off";
        }
      }
    };

    const draw = () => {
      raf = requestAnimationFrame(draw);
      if (!onScreen) return;
      const p = progress();
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const w = Math.round(canvas.clientWidth * dpr);
      const h = Math.round(canvas.clientHeight * dpr);
      if (!w || !h) return;
      if (!seq) {
        seq = loadSequence(urls, { start: frameAt(p, urls.length) });
      }
      let ready = 0;
      for (let i = 0; i < urls.length; i++) if (seq.ready(i)) ready++;
      const moved = Math.abs(p - last.p) > 0.0002;
      if (!moved && w === last.w && h === last.h && ready === last.ready) return;
      if (moved) seq.focus(frameAt(p, urls.length));
      placeChapters(p);
      stage.style.setProperty("--p", p.toFixed(4));

      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      // Portrait screens ease from a crop of the room to the whole page of panels.
      const portrait = w / h < 1.2;
      const fit = portrait ? smooth(clamp01((p - c0) / Math.max(0.001, c1 - c0))) : 0;
      const drew = drawSequence(ctx, seq, p, w, h, 1, { fit, x: fx, y: fy });
      if (drew) {
        const calm = smooth(clamp01((p - s0) / Math.max(0.001, s1 - s0)));
        if (calm > 0 && paper) {
          ctx.globalAlpha = calm;
          ctx.fillStyle = paper;
          ctx.fillRect(0, 0, w, h);
          ctx.globalAlpha = 1;
        }
        if (!last.drew) stage.dataset.drawn = "";
      }
      last = { p, w, h, ready, drew: last.drew || drew };
    };

    const io = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
    }, { rootMargin: "200px 0px" });
    io.observe(section);

    // Keyboard focus on a faded chapter (the Record stamp, say) scrolls the film back to it.
    const onFocus = (event: FocusEvent) => {
      const w = windows.find((x) => x.el.contains(event.target as Node));
      if (!w || w.on) return;
      const run = section.offsetHeight - stage.offsetHeight;
      const top = section.getBoundingClientRect().top + window.scrollY - stickTop;
      window.scrollTo({ top: top + run * w.at, behavior: "instant" });
    };
    chapterBox.addEventListener("focusin", onFocus);

    const theme = new MutationObserver(measure);
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const scheme = window.matchMedia("(prefers-color-scheme: dark)");
    scheme.addEventListener("change", measure);
    window.addEventListener("resize", measure);
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      theme.disconnect();
      scheme.removeEventListener("change", measure);
      window.removeEventListener("resize", measure);
      chapterBox.removeEventListener("focusin", onFocus);
      seq?.stop();
      delete stage.dataset.drawn;
      stage.style.removeProperty("--p");
      for (const w of windows) {
        w.el.style.removeProperty("--v");
        w.el.style.removeProperty("--shift");
        delete w.el.dataset.state;
      }
    };
  }, [dir, count, fx, fy, c0, c1, s0, s1]);

  const style = {
    "--film-length": length,
    "--focus": `${fx * 100}% ${fy * 100}%`,
  } as CSSProperties;

  return (
    <section ref={sectionRef} className={[styles.film, className].filter(Boolean).join(" ")} style={style} aria-label={label}>
      <div ref={stageRef} className={styles.stage}>
        {/* The first frame, until the canvas draws (and for good with reduced motion). Same box as the canvas. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className={styles.poster} src={urls[0]} alt={stillAlt[0]} fetchPriority="high" decoding="async" />
        <canvas ref={canvasRef} className={styles.canvas} aria-hidden="true" />
        <div className={styles.scrim} aria-hidden="true" />
      </div>
      <div ref={chaptersRef} className={styles.chapters}>
        {children}
      </div>
      {/* The film's last frame, shown under the chapters when the film doesn't play. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className={styles.endStill} src={urls[urls.length - 1]} alt={stillAlt[1]} loading="lazy" decoding="async" />
    </section>
  );
}
