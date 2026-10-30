"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type RefObject } from "react";
import { artAt } from "@/art/manifest";
import { getImage } from "@/lib/store";
import type { SpriteAnimation, SpriteAnimationName, SpriteSheet } from "@/lib/types";
import styles from "./sprite.module.css";

interface SpriteProps {
  sheet: SpriteSheet;
  /** Accessible name, e.g. "Mimo waving". Empty string makes the sprite decorative. */
  label: string;
  /** Plays the talk row (instead of idle) while true. */
  talking?: boolean;
  /** Waves once the first time the sprite is on screen. */
  greet?: boolean;
  /**
   * Element whose hover, tap or keyboard focus makes the sprite wave (a card,
   * a button). Defaults to the sprite itself.
   */
  hostRef?: RefObject<HTMLElement | null>;
  className?: string;
}

type OneShot = "blink" | "wave";

/** Gap between blinks, in ms. Random so a row of sprites never blinks in sync. */
const BLINK_MIN = 2200;
const BLINK_SPREAD = 3800;

/* ---------- Reduced motion, read once and kept in sync ---------- */

const REDUCE_QUERY = "(prefers-reduced-motion: reduce)";
function subscribeReduced(onChange: () => void) {
  const query = window.matchMedia(REDUCE_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}
const reducedSnapshot = () => window.matchMedia(REDUCE_QUERY).matches;
// The server can't know; it renders the still first frame, which is also the reduced-motion look.
const reducedServerSnapshot = () => true;

/* ---------- Tab visibility ---------- */

function subscribeHidden(onChange: () => void) {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
}
const hiddenSnapshot = () => document.visibilityState === "hidden";
const hiddenServerSnapshot = () => false;

/** The sheet image as a URL: manifest art directly, stored Blobs as an object URL. */
function useSheetUrl(sheet: SpriteSheet): string | null {
  const ref = sheet.image;
  const artUrl = ref.kind === "art" ? artAt(ref.path).src : null;
  const blobId = ref.kind === "blob" ? ref.id : null;
  const [blobUrl, setBlobUrl] = useState<{ id: string; url: string } | null>(null);

  useEffect(() => {
    if (!blobId) return;
    let url: string | null = null;
    let cancelled = false;
    void getImage(blobId).then((blob) => {
      if (cancelled || !blob) return;
      url = URL.createObjectURL(blob);
      setBlobUrl({ id: blobId, url });
    });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [blobId]);

  return artUrl ?? (blobUrl && blobUrl.id === blobId ? blobUrl.url : null);
}

/**
 * Plays one row of a sprite sheet with CSS steps() on background-position.
 *
 * Idle loops with a random blink now and then, talk loops while `talking`,
 * and wave plays once on hover, tap or focus. The animation pauses while the
 * sprite is off screen or the tab is hidden; under reduced motion the sprite
 * holds its first idle frame and nothing plays.
 */
export function Sprite({ sheet, label, talking = false, greet = false, hostRef, className }: SpriteProps) {
  const ownRef = useRef<HTMLSpanElement>(null);
  const url = useSheetUrl(sheet);
  const reduced = useSyncExternalStore(subscribeReduced, reducedSnapshot, reducedServerSnapshot);
  const hidden = useSyncExternalStore(subscribeHidden, hiddenSnapshot, hiddenServerSnapshot);
  const [onScreen, setOnScreen] = useState(false);
  const [oneShot, setOneShot] = useState<{ name: OneShot; take: number } | null>(null);
  const greeted = useRef(false);

  const playing = !reduced && !hidden && onScreen;
  const wantsTalk = talking && !!sheet.animations.talk;

  // On screen or not.
  useEffect(() => {
    const el = ownRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setOnScreen(entry.isIntersecting), { threshold: 0.15 });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Wave on hover (mouse), tap (touch or pen) and keyboard focus of the host.
  useEffect(() => {
    if (reduced || !sheet.animations.wave) return;
    const host = hostRef?.current ?? ownRef.current;
    if (!host) return;
    const wave = () =>
      setOneShot((current) => (current?.name === "wave" ? current : { name: "wave", take: (current?.take ?? 0) + 1 }));
    const onEnter = (event: PointerEvent) => {
      if (event.pointerType === "mouse") wave();
    };
    const onDown = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") wave();
    };
    const onFocus = (event: FocusEvent) => {
      if ((event.target as Element | null)?.matches?.(":focus-visible")) wave();
    };
    host.addEventListener("pointerenter", onEnter);
    host.addEventListener("pointerdown", onDown);
    host.addEventListener("focusin", onFocus);
    return () => {
      host.removeEventListener("pointerenter", onEnter);
      host.removeEventListener("pointerdown", onDown);
      host.removeEventListener("focusin", onFocus);
    };
  }, [hostRef, reduced, sheet.animations.wave]);

  // Greet once, a beat after first appearing (after any pop-in).
  useEffect(() => {
    if (!greet || greeted.current || !playing || !sheet.animations.wave) return;
    const timer = setTimeout(() => {
      greeted.current = true;
      setOneShot((current) => current ?? { name: "wave", take: 1 });
    }, 700);
    return () => clearTimeout(timer);
  }, [greet, playing, sheet.animations.wave]);

  // Blink now and then while idling.
  useEffect(() => {
    if (!playing || oneShot || wantsTalk || !sheet.animations.blink) return;
    const timer = setTimeout(
      () => setOneShot((current) => current ?? { name: "blink", take: 1 }),
      BLINK_MIN + Math.random() * BLINK_SPREAD,
    );
    return () => clearTimeout(timer);
  }, [playing, oneShot, wantsTalk, sheet.animations.blink]);

  // Nothing plays under reduced motion: hold the first idle frame.
  const name: SpriteAnimationName = reduced ? "idle" : (oneShot?.name ?? (wantsTalk ? "talk" : "idle"));
  const animation: SpriteAnimation = sheet.animations[name] ?? sheet.animations.idle;
  const rows = Math.max(...Object.values(sheet.animations).map((a) => (a ? a.row : 0))) + 1;
  const columns = Math.max(1, sheet.columns);
  const frames = Math.max(1, Math.min(animation.frames, columns));
  const moving = !reduced && frames > 1 && columns > 1;

  const frameStyle = {
    backgroundImage: url ? `url("${url}")` : undefined,
    backgroundSize: `${columns * 100}% ${rows * 100}%`,
    "--sprite-row": rows > 1 ? `${(animation.row / (rows - 1)) * 100}%` : "0%",
    "--sprite-end": columns > 1 ? `${(frames / (columns - 1)) * 100}%` : "0%",
    "--sprite-steps": frames,
    "--sprite-duration": `${frames / Math.max(1, animation.fps)}s`,
    "--sprite-iterations": animation.loop ? "infinite" : 1,
  } as CSSProperties;

  return (
    <span
      ref={ownRef}
      className={`${styles.sprite}${className ? ` ${className}` : ""}`}
      style={{ aspectRatio: `${sheet.frameWidth} / ${sheet.frameHeight}` }}
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
      data-sprite={name}
      data-playing={playing && moving ? "" : undefined}
    >
      <span
        // A new key restarts the CSS animation from frame one.
        key={`${name}-${oneShot?.take ?? 0}`}
        className={styles.frames}
        data-moving={moving ? "" : undefined}
        style={frameStyle}
        onAnimationEnd={() => {
          if (oneShot) setOneShot(null);
        }}
      />
    </span>
  );
}
