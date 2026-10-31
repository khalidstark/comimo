"use client";

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { Art } from "@/art/Art";
import { spriteSheets } from "@/art/sprites";
import { BidiText } from "@/components/comic/BidiText";
import { Sprite } from "@/components/Sprite";
import { firstStrongDir } from "@/lib/bidi";
import { useTalkWhenShown } from "@/components/useTalkWhenShown";
import { DEMO_TITLE, DEMO_TRANSCRIPT, demoPanels, type DemoStyle } from "./demoContent";
import styles from "./DemoDay.module.css";

const STYLES: { id: DemoStyle; label: string }[] = [
  { id: "zine", label: "Zine" },
  { id: "painterly", label: "Painterly" },
];

const GUIDE = "Switch the style, or flip the cat panel.";
const SIZES_WIDE = "(min-width: 64rem) 40rem, (min-width: 48rem) 60vw, 100vw";
const SIZES_HALF = "(min-width: 64rem) 20rem, (min-width: 48rem) 30vw, 50vw";

/** Heights for the decorative voice-note waveform, fixed so server and client agree. */
const WAVE = [5, 9, 14, 8, 18, 24, 12, 7, 16, 22, 28, 19, 11, 6, 13, 21, 26, 17, 9, 14, 20, 12, 7, 10, 16, 8, 5, 11];

/**
 * A real day made by Comimo, on the home page. The page assembles panel by
 * panel when it scrolls into view; the style switch runs a print pass across
 * every panel (a roller wipes the new inks on); the cat panel flips over to
 * the same scene drawn without the cast's reference sheets.
 */
export function DemoDay() {
  const pageRef = useRef<HTMLOListElement>(null);
  const guideRef = useRef<HTMLParagraphElement>(null);
  const [style, setStyle] = useState<DemoStyle>("zine");
  const [previous, setPrevious] = useState<DemoStyle | null>(null);
  const [pass, setPass] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [armed, setArmed] = useState(false);
  const [shown, setShown] = useState(false);
  const talking = useTalkWhenShown(guideRef, GUIDE);

  // Hold the panels back until the page is on screen, then ink them in reading order.
  useEffect(() => {
    const page = pageRef.current;
    if (!page || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const rect = page.getBoundingClientRect();
    if (rect.top < window.innerHeight * 0.85) return; // already in view: no hiding, no waiting
    setArmed(true);
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          observer.disconnect();
        }
      },
      { threshold: 0.2 },
    );
    observer.observe(page);
    return () => observer.disconnect();
  }, []);

  function choose(next: DemoStyle) {
    if (next === style) return;
    setPrevious(style);
    setStyle(next);
    setPass((n) => n + 1);
  }

  /** Panels lean a little toward a mouse pointer. Touch and pen never tilt. */
  function tilt(event: PointerEvent<HTMLLIElement>) {
    if (event.pointerType !== "mouse") return;
    const el = event.currentTarget;
    const box = el.getBoundingClientRect();
    const x = (event.clientX - box.left) / box.width - 0.5;
    const y = (event.clientY - box.top) / box.height - 0.5;
    el.style.setProperty("--ry", `${(x * 5).toFixed(2)}deg`);
    el.style.setProperty("--rx", `${(-y * 5).toFixed(2)}deg`);
  }

  function untilt(event: PointerEvent<HTMLLIElement>) {
    event.currentTarget.style.setProperty("--ry", "0deg");
    event.currentTarget.style.setProperty("--rx", "0deg");
  }

  const layerState = (s: DemoStyle) => (s === style ? "in" : s === previous ? "out" : "off");

  return (
    <div className={styles.demo}>
      <div className={styles.side}>
        <figure className={styles.note}>
          <figcaption className={styles.noteHead}>
            <span className={styles.play} aria-hidden="true" />
            <span>Nour&apos;s voice note</span>
          </figcaption>
          <span className={styles.wave} aria-hidden="true">
            {WAVE.map((h, i) => (
              <span key={i} style={{ "--h": h } as CSSProperties} />
            ))}
          </span>
          <blockquote className={styles.transcript} dir="ltr">
            <BidiText text={DEMO_TRANSCRIPT} />
          </blockquote>
        </figure>

        <div className={styles.controls}>
          <div className={styles.switch} role="group" aria-label="Art style">
            {STYLES.map((s) => (
              <button
                key={s.id}
                type="button"
                className={styles.switchButton}
                aria-pressed={style === s.id}
                onClick={() => choose(s.id)}
              >
                {s.label}
              </button>
            ))}
            <span className={styles.switchThumb} data-at={style} aria-hidden="true" />
          </div>

          <div className={styles.guide}>
            <Sprite sheet={spriteSheets.mascot} label="" talking={talking} className={styles.guideSprite} />
            <p ref={guideRef} className={`bubble ${styles.guideBubble}`}>
              {GUIDE}
            </p>
          </div>
        </div>
      </div>

      <ol
        ref={pageRef}
        className={styles.page}
        aria-label={`The comic: ${DEMO_TITLE}`}
        data-armed={armed || undefined}
        data-shown={shown || undefined}
      >
        {demoPanels.map((panel, i) => {
          const isFlipped = Boolean(panel.before) && flipped;
          return (
            <li
              key={i}
              className={`${styles.cell} ${panel.wide ? styles.wide : ""}`}
              style={{ "--i": i } as CSSProperties}
              onPointerMove={tilt}
              onPointerLeave={untilt}
            >
              <div className={styles.card} data-flipped={isFlipped || undefined}>
                <div className={`${styles.face} ${styles.front}`} aria-hidden={isFlipped || undefined}>
                  {STYLES.map(({ id }) => (
                    <span key={id} className={styles.layer} data-state={layerState(id)}>
                      <Art
                        asset={panel.art[id]}
                        className={styles.layerArt}
                        sizes={panel.wide ? SIZES_WIDE : SIZES_HALF}
                        alt={id === style ? undefined : ""}
                      />
                    </span>
                  ))}
                  {pass > 0 ? <span key={pass} className={styles.roller} aria-hidden="true" /> : null}
                  <p className={`caption ${styles.caption}`}>
                    <span className={styles.text} dir={firstStrongDir(panel.caption) ?? "ltr"}>
                      <BidiText text={panel.caption} />
                    </span>
                  </p>
                  <p className={`bubble ${i % 2 ? "" : "bubble--tail-end"} ${styles.bubble}`}>
                    <span className="bubble__who">{panel.speaker}</span>
                    <span className={styles.text} dir={firstStrongDir(panel.line) ?? "ltr"}>
                      <BidiText text={panel.line} />
                    </span>
                  </p>
                </div>
                {panel.before ? (
                  <div className={`${styles.face} ${styles.back}`} aria-hidden={!isFlipped || undefined}>
                    <Art asset={panel.before[style]} className={styles.beforeArt} sizes={SIZES_HALF} />
                    <span className={styles.stamp}>No reference sheets</span>
                  </div>
                ) : null}
              </div>
              {panel.before ? (
                <button
                  type="button"
                  className={styles.flip}
                  aria-pressed={flipped}
                  onClick={() => setFlipped((f) => !f)}
                >
                  {flipped ? "Back to the comic" : "Without the sheets?"}
                </button>
              ) : null}
            </li>
          );
        })}
      </ol>
      <p className={styles.flipNote} aria-live="polite">
        {flipped
          ? "The cat panel is now the same scene and descriptions, drawn without the cast's reference sheets: faces, clothes and the cat drift. The sheets keep everyone looking like themselves."
          : ""}
      </p>
    </div>
  );
}
