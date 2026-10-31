import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill, Audio, Sequence, random, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { C, F, RADIUS_PANEL, shadow } from "../theme";
import { map, pop, progress, track, type Key } from "../lib/anim";

/* ---------- Layout ---------- */

/** Orientation and a unit that keeps sizes equal in 16:9 and 9:16 (1 at 1080 short side). */
export function useLayout() {
  const { width, height } = useVideoConfig();
  const vertical = height > width;
  return { width, height, vertical, u: Math.min(width, height) / 1080 };
}

/**
 * Scales a fixed-size design surface (w x h design pixels) into a box, so a
 * UI card is laid out once and cursor targets are plain design coordinates.
 */
export function Fit({ w, h, box, children, style }: { w: number; h: number; box: { x: number; y: number; w: number; h: number }; children: ReactNode; style?: CSSProperties }) {
  const scale = Math.min(box.w / w, box.h / h);
  return (
    <div
      style={{
        position: "absolute",
        left: box.x + (box.w - w * scale) / 2,
        top: box.y + (box.h - h * scale) / 2,
        width: w,
        height: h,
        transform: `scale(${scale})`,
        transformOrigin: "0 0",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/* ---------- Sound ---------- */

export type SfxName =
  | "click"
  | "tick1"
  | "tick2"
  | "tick3"
  | "whoosh"
  | "whoosh-short"
  | "flip"
  | "pop"
  | "shutter"
  | "sparkle"
  | "thud"
  | "scratch"
  | "riser"
  | "snap";

/** One synthesized sound effect at a frame of the current sequence. */
export function Sfx({ at, name, volume = 0.6 }: { at: number; name: SfxName; volume?: number }) {
  return (
    <Sequence from={Math.round(at)} durationInFrames={120} layout="none" name={`sfx ${name}`}>
      <Audio src={staticFile(`own/sfx/${name}.wav`)} volume={volume} />
    </Sequence>
  );
}

/** Typing ticks every `every` frames between `from` and `to`. */
export function TypingSfx({ from, to, every = 3, volume = 0.22 }: { from: number; to: number; every?: number; volume?: number }) {
  const ticks: ReactNode[] = [];
  for (let f = from, i = 0; f < to; f += every, i++) {
    const name = (["tick1", "tick2", "tick3"] as const)[Math.floor(random(`tick${f}`) * 3)];
    ticks.push(<Sfx key={f} at={f} name={name} volume={volume * (0.7 + random(`v${f}`) * 0.5)} />);
  }
  return <>{ticks}</>;
}

/* ---------- Cinematic camera and grade ---------- */

/**
 * A slow camera move over the whole scene: scale and drift keyframes,
 * eased, so nothing ever sits perfectly still.
 */
export function Camera({ keys, children }: { keys: { f: number; scale: number; x?: number; y?: number; rotate?: number }[]; children: ReactNode }) {
  const frame = useCurrentFrame();
  const at = (pick: (k: (typeof keys)[number]) => number) =>
    map(
      frame,
      keys.map((k) => k.f),
      keys.map(pick),
    );
  const scale = keys.length > 1 ? at((k) => k.scale) : keys[0].scale;
  const x = keys.length > 1 ? at((k) => k.x ?? 0) : (keys[0].x ?? 0);
  const y = keys.length > 1 ? at((k) => k.y ?? 0) : (keys[0].y ?? 0);
  const rotate = keys.length > 1 ? at((k) => k.rotate ?? 0) : (keys[0].rotate ?? 0);
  return (
    <AbsoluteFill style={{ transform: `translate(${x}px, ${y}px) scale(${scale}) rotate(${rotate}deg)`, transformOrigin: "50% 50%" }}>{children}</AbsoluteFill>
  );
}

const GRAIN = `url("data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.1  0 0 0 0 0.12  0 0 0 0 0.25  0 0 0 0.55 0'/></filter><rect width='240' height='240' filter='url(#n)'/></svg>`,
)}")`;

/** The grade over everything: a soft navy vignette, a warm lift and moving print grain. */
export function Grade({ strength = 1 }: { strength?: number }) {
  const frame = useCurrentFrame();
  const ox = Math.floor(random(`gx${frame}`) * 240);
  const oy = Math.floor(random(`gy${frame}`) * 240);
  return (
    <AbsoluteFill style={{ pointerEvents: "none", zIndex: 1000 }}>
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 45%, transparent 55%, rgba(12,16,41,0.42) 100%)", opacity: strength }} />
      <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(255,199,56,0.05), rgba(242,57,122,0.04))", mixBlendMode: "soft-light" }} />
      <AbsoluteFill style={{ backgroundImage: GRAIN, backgroundPosition: `${ox}px ${oy}px`, opacity: 0.16 * strength, mixBlendMode: "multiply" }} />
    </AbsoluteFill>
  );
}

/* ---------- Cursor ---------- */

export interface CursorKey extends Key {
  click?: boolean;
}

/** A pointer that glides between targets and ripples on each click (design coordinates). */
export function Cursor({ keys, appear = 0, hideAt }: { keys: CursorKey[]; appear?: number; hideAt?: number }) {
  const frame = useCurrentFrame();
  const { x, y } = track(frame, keys);
  const lastClick = [...keys].reverse().find((k) => k.click && frame >= k.f);
  const since = lastClick ? frame - lastClick.f : 99;
  const press = since < 6 ? 1 - Math.sin((since / 6) * Math.PI) * 0.18 : 1;
  const visible = map(frame, [appear, appear + 8], [0, 1]) * (hideAt === undefined ? 1 : map(frame, [hideAt, hideAt + 8], [1, 0]));
  return (
    <div style={{ position: "absolute", left: 0, top: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 50, opacity: visible }}>
      {lastClick && since < 18 ? (
        <div
          style={{
            position: "absolute",
            left: lastClick.x - 34,
            top: lastClick.y - 34,
            width: 68,
            height: 68,
            borderRadius: 999,
            border: `4px solid ${C.accent}`,
            transform: `scale(${0.3 + since / 12})`,
            opacity: 1 - since / 18,
          }}
        />
      ) : null}
      <svg width="46" height="54" viewBox="0 0 23 27" style={{ position: "absolute", left: x - 4, top: y - 2, transform: `scale(${press})`, transformOrigin: "4px 2px", filter: "drop-shadow(3px 4px 0 rgba(27,33,72,0.35))" }}>
        <path d="M2 1 L2 21 L7.5 16.5 L11 25 L14.5 23.5 L11 15.5 L18 15.5 Z" fill={C.ink} stroke={C.white} strokeWidth="1.6" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

/* ---------- The site's UI pieces ---------- */

export function Button({ children, tone = "accent", pressedAt, style }: { children: ReactNode; tone?: "accent" | "ghost" | "calm" | "highlight"; pressedAt?: number; style?: CSSProperties }) {
  const frame = useCurrentFrame();
  const since = pressedAt === undefined ? 99 : frame - pressedAt;
  const down = since >= 0 && since < 7;
  const bg = { accent: C.accent, ghost: C.surface, calm: C.calm, highlight: C.highlight }[tone];
  const fg = tone === "calm" ? C.white : C.ink;
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        padding: "12px 24px",
        borderRadius: 14,
        border: `3px solid ${C.ink}`,
        background: bg,
        color: fg,
        fontFamily: F.display,
        fontWeight: 700,
        fontSize: 26,
        lineHeight: 1.2,
        boxShadow: down ? "0 0 0 transparent" : shadow(4),
        transform: down ? "translate(4px, 4px)" : "none",
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function Chip({ children, tone = "ink", style }: { children: ReactNode; tone?: "ink" | "calm" | "accent" | "highlight" | "paper"; style?: CSSProperties }) {
  const look = {
    ink: { background: C.ink, color: C.white },
    calm: { background: C.calmWash, color: C.calmText },
    accent: { background: C.accent, color: C.ink },
    highlight: { background: C.highlight, color: C.ink },
    paper: { background: C.surface, color: C.ink },
  }[tone];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "5px 14px",
        borderRadius: 999,
        border: `2px solid ${C.ink}`,
        fontFamily: F.display,
        fontWeight: 700,
        fontSize: 20,
        lineHeight: 1.2,
        whiteSpace: "nowrap",
        ...look,
        ...style,
      }}
    >
      {children}
    </span>
  );
}

/** The yellow lettered caption box from the comic pages. */
export function CaptionBox({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      style={{
        display: "inline-block",
        padding: "6px 14px",
        background: C.highlight,
        border: `2.5px solid ${C.ink}`,
        borderRadius: RADIUS_PANEL,
        color: C.ink,
        fontFamily: F.lettering,
        fontWeight: 500,
        fontSize: 24,
        lineHeight: 1.25,
        transform: "rotate(-1.2deg)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** A white speech bubble with an ink tail (tail side: left or right, at the bottom). */
export function Bubble({ children, tail = "left", style }: { children: ReactNode; tail?: "left" | "right"; style?: CSSProperties }) {
  return (
    <div style={{ position: "relative", display: "inline-block", ...style }}>
      <div
        style={{
          position: "relative",
          zIndex: 1,
          padding: "10px 18px",
          background: C.white,
          border: `3px solid ${C.ink}`,
          borderRadius: 26,
          color: C.ink,
          fontFamily: F.lettering,
          fontWeight: 500,
          fontSize: 23,
          lineHeight: 1.25,
        }}
      >
        {children}
      </div>
      <svg width="34" height="26" viewBox="0 0 34 26" style={{ position: "absolute", bottom: -21, [tail]: 30, zIndex: 2, transform: tail === "right" ? "scaleX(-1)" : undefined }}>
        <path d="M2 0 L10 24 L30 0" fill={C.white} stroke={C.ink} strokeWidth="3" strokeLinejoin="round" />
        <rect x="0" y="-3" width="34" height="5" fill={C.white} />
      </svg>
    </div>
  );
}

/** A card with the site's ink border and hard shadow. */
export function Card({ children, style, soft }: { children: ReactNode; style?: CSSProperties; soft?: boolean }) {
  return (
    <div
      style={{
        position: "absolute",
        background: C.surface,
        border: `3px solid ${C.ink}`,
        borderRadius: soft ? 22 : 18,
        boxShadow: shadow(7, soft ? C.highlight : C.ink),
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/* ---------- Kinetic step titles ---------- */

/**
 * Editorial kinetic type for each step: a yellow kicker, then the title's
 * words rise out of a mask one by one, then a calm line under it.
 */
export function StepTitle({
  step,
  kicker,
  title,
  sub,
  start = 4,
  size = 92,
  width = 700,
  color = C.ink,
  align = "left",
}: {
  step?: number;
  kicker: string;
  title: string;
  sub?: string;
  start?: number;
  size?: number;
  width?: number;
  color?: string;
  align?: "left" | "center";
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const words = title.split(" ").flatMap((word) => word.split(/(\n)/)).filter(Boolean);
  const k = pop(frame, start, fps, 200, 16);
  const subIn = progress(frame, start + 10 + words.length * 3, 16);
  return (
    <div style={{ width, textAlign: align, color }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, justifyContent: align === "center" ? "center" : "flex-start", transform: `scale(${k})`, transformOrigin: align === "center" ? "50% 50%" : "0 50%" }}>
        {step !== undefined ? (
          <span
            style={{
              display: "inline-grid",
              placeItems: "center",
              width: 52,
              height: 52,
              borderRadius: 999,
              background: C.accent,
              border: `3px solid ${C.ink}`,
              fontFamily: F.display,
              fontWeight: 800,
              fontSize: 28,
              color: C.ink,
              boxShadow: shadow(3),
            }}
          >
            {step}
          </span>
        ) : null}
        <CaptionBox style={{ fontFamily: F.display, fontWeight: 700, fontSize: 26, padding: "4px 14px" }}>{kicker}</CaptionBox>
      </div>
      <h1 style={{ margin: "22px 0 0", fontFamily: F.display, fontWeight: 800, fontSize: size, lineHeight: 1.0, letterSpacing: "-0.02em" }}>
        {words.map((word, i) => {
          if (word === "\n") return <br key={i} />;
          const t = progress(frame, start + 6 + i * 3, 18);
          return (
            <span key={i} style={{ display: "inline-block", overflow: "hidden", verticalAlign: "top", paddingBottom: "0.08em", marginRight: "0.24em" }}>
              <span style={{ display: "inline-block", transform: `translateY(${(1 - t) * 105}%) rotate(${(1 - t) * 6}deg)`, transformOrigin: "0 100%" }}>{word}</span>
            </span>
          );
        })}
      </h1>
      {sub ? (
        <p style={{ margin: "18px 0 0", fontFamily: F.body, fontSize: 30, lineHeight: 1.4, color: color === C.ink ? C.inkSoft : C.onNightSoft, opacity: subIn, transform: `translateY(${(1 - subIn) * 14}px)` }}>{sub}</p>
      ) : null}
    </div>
  );
}

/** Where StepFrame puts the UI (exported so scenes can aim the camera at it). */
export function uiBoxFor(width: number, height: number, titleWidthH = 640, vTitleHeight = 560) {
  return height > width
    ? { x: 30, y: vTitleHeight, w: width - 60, h: height - vTitleHeight - 110 }
    : { x: titleWidthH + 160, y: 70, w: width - titleWidthH - 230, h: height - 140 };
}

/** Screen position of a design point inside a Fit box. */
export function fitPoint(box: { x: number; y: number; w: number; h: number }, w: number, h: number, px: number, py: number) {
  const scale = Math.min(box.w / w, box.h / h);
  return { x: box.x + (box.w - w * scale) / 2 + px * scale, y: box.y + (box.h - h * scale) / 2 + py * scale, scale };
}

/**
 * The common frame for a step: halftone paper, the title block and a UI
 * box (left/right in 16:9, top/bottom in 9:16). `ui` gets the box to fit into.
 */
export function StepFrame({
  title,
  ui,
  titleWidthH = 640,
  vTitleHeight = 560,
}: {
  title: ReactNode;
  ui: (box: { x: number; y: number; w: number; h: number }) => ReactNode;
  titleWidthH?: number;
  vTitleHeight?: number;
}) {
  const { width, height, vertical } = useLayout();
  const titleBox = vertical ? { left: 80, top: 150, width: width - 160 } : { left: 110, top: 0, width: titleWidthH, height, display: "flex", alignItems: "center" };
  const uiBox = uiBoxFor(width, height, titleWidthH, vTitleHeight);
  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", ...titleBox } as CSSProperties}>{title}</div>
      {ui(uiBox)}
    </AbsoluteFill>
  );
}

/** Halftone paper ground with a soft light from the top. */
export function Paper({ tint }: { tint?: string }) {
  return (
    <AbsoluteFill
      style={{
        backgroundColor: tint ?? C.paper,
        backgroundImage: `radial-gradient(${C.dot} 1.4px, transparent 1.7px), radial-gradient(ellipse at 40% 0%, rgba(255,255,255,0.7), transparent 60%)`,
        backgroundSize: "16px 16px, 100% 100%",
      }}
    />
  );
}
