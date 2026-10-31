import type { ReactNode } from "react";
import { AbsoluteFill, Img, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Bubble, CaptionBox, Chip, Fit, Paper, Sfx, StepFrame, StepTitle, fitPoint, uiBoxFor, useLayout } from "../components/core";
import { C, F, shadow } from "../theme";
import { cine, inkEase, map, pop, progress, settle } from "../lib/anim";

const PAGE = { w: 720, h: 1000 };

/* Timeline */
const PANEL_AT = { p1: 14, p2: 26, p4: 38, p5: 50, p3: 66 };
const LETTER_AT = [86, 98, 110, 122, 134];
const ZOOM_IN = 150;
const SCAN = 180;
const FACES = 192;
const SHEET = 206;
const FLIP = 226;
const FIXED = 246;
const ZOOM_OUT = 282;
export const PAGE_BUILD_DURATION = 372;

type Pt = [number, number];
const SHAPES: Record<string, Pt[]> = {
  p1: [[20, 20], [372, 20], [352, 330], [20, 330]],
  p2: [[386, 20], [700, 20], [700, 330], [366, 330]],
  p4: [[20, 344], [700, 344], [700, 556], [20, 562]],
  p5: [[20, 576], [700, 570], [700, 980], [20, 980]],
};
const INSET = { x: 410, y: 500, size: 272 };
const INSET_CENTRE = { x: INSET.x + INSET.size / 2, y: INSET.y + INSET.size / 2 };

function bounds(points: Pt[]) {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}

/** A slanted panel: the art clipped to its shape, inked in by a sweeping white cover. */
function Panel({ id, src, position, at, children }: { id: string; src: string; position: string; at: number; children?: ReactNode }) {
  const frame = useCurrentFrame();
  const points = SHAPES[id];
  const b = bounds(points);
  const clip = `polygon(${points.map(([x, y]) => `${x - b.x}px ${y - b.y}px`).join(", ")})`;
  const t = progress(frame, at, 16, inkEase);
  if (frame < at) return null;
  return (
    <div style={{ position: "absolute", left: b.x, top: b.y, width: b.w, height: b.h }}>
      <div style={{ position: "absolute", inset: 0, clipPath: clip, background: C.surface }}>
        <Img src={staticFile(src)} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: position, transform: `scale(${1.18 - t * 0.18})` }} />
        <div style={{ position: "absolute", top: -40, bottom: -40, left: 0, width: b.w * 1.6, background: C.surface, transform: `translateX(${t * b.w * 1.25}px) skewX(-14deg)` }} />
      </div>
      {children}
    </div>
  );
}

function Outlines() {
  const frame = useCurrentFrame();
  return (
    <svg width={PAGE.w} height={PAGE.h} style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      {Object.entries(SHAPES).map(([id, points]) => {
        const at = PANEL_AT[id as keyof typeof PANEL_AT];
        const t = progress(frame, at, 18, inkEase);
        if (frame < at) return null;
        return (
          <polygon
            key={id}
            points={points.map((p) => p.join(",")).join(" ")}
            fill="none"
            stroke={C.ink}
            strokeWidth={4}
            strokeLinejoin="round"
            pathLength={100}
            strokeDasharray="100"
            strokeDashoffset={100 - t * 100}
          />
        );
      })}
    </svg>
  );
}

const BEFORE_FACES = [
  { name: "Nour", ok: false, x: 0.04, y: 0.32, w: 0.26, h: 0.3 },
  { name: "Teta", ok: true, x: 0.37, y: 0.41, w: 0.17, h: 0.2 },
  { name: "Karim", ok: true, x: 0.63, y: 0.25, w: 0.21, h: 0.27 },
];
const AFTER_FACES = [
  { name: "Nour", ok: true, x: 0.168, y: 0.326, w: 0.159, h: 0.174 },
  { name: "Teta", ok: true, x: 0.438, y: 0.348, w: 0.14, h: 0.176 },
  { name: "Karim", ok: true, x: 0.673, y: 0.309, w: 0.131, h: 0.174 },
];

function FaceBoxes({ faces, at, until }: { faces: typeof BEFORE_FACES; at: number; until: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (frame < at || frame > until + 8) return null;
  const out = map(frame, [until, until + 8], [1, 0]);
  return (
    <>
      {faces.map((face, i) => {
        const s = pop(frame, at + i * 3, fps, 260, 14);
        const color = face.ok ? C.calm : C.accent;
        return (
          <div key={face.name} style={{ position: "absolute", left: `${face.x * 100}%`, top: `${face.y * 100}%`, width: `${face.w * 100}%`, height: `${face.h * 100}%`, border: `3px ${face.ok ? "dashed" : "solid"} ${color}`, borderRadius: 6, transform: `scale(${s})`, opacity: out, boxShadow: face.ok ? "none" : `0 0 0 3px rgba(242,57,122,0.25)` }}>
            <span style={{ position: "absolute", left: -3, top: -30, padding: "1px 8px", background: color, color: face.ok ? C.white : C.ink, fontFamily: F.display, fontWeight: 700, fontSize: 18, whiteSpace: "nowrap", borderRadius: 4 }}>
              {face.name} {face.ok ? "✓" : "✗"}
            </span>
          </div>
        );
      })}
    </>
  );
}

/** The close-up inset that SAM checks and fixes (flips from before to after). */
function Inset() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const at = PANEL_AT.p3;
  if (frame < at) return null;
  const slam = pop(frame, at, fps, 240, 13);
  const flip = progress(frame, FLIP, 18, inkEase);
  const angle = flip * 180;
  const showAfter = angle > 90;
  const scan = progress(frame, SCAN, 20, inkEase);
  return (
    <div style={{ position: "absolute", left: INSET.x, top: INSET.y, width: INSET.size, height: INSET.size, transform: `scale(${2 - slam}) rotate(-2.5deg)`, opacity: Math.min(1, slam * 2), perspective: 900 }}>
      <div style={{ position: "absolute", inset: 0, transform: `rotateY(${angle}deg)`, transformStyle: "preserve-3d" }}>
        <div style={{ position: "absolute", inset: 0, transform: showAfter ? "rotateY(180deg)" : "none", border: `5px solid ${C.surface}`, outline: `4px solid ${C.ink}`, background: C.surface, boxShadow: shadow(6), overflow: "hidden" }}>
          <Img src={staticFile(showAfter ? "own/panels/basbousa-2.jpg" : "own/panels/basbousa-2-before.jpg")} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          {frame >= SCAN && frame < SCAN + 22 ? <div style={{ position: "absolute", top: 0, bottom: 0, left: `${scan * 100}%`, width: 5, background: C.calm, boxShadow: "0 0 18px 6px rgba(15,158,142,0.6)" }} /> : null}
          {!showAfter ? <FaceBoxes faces={BEFORE_FACES} at={FACES} until={FLIP - 2} /> : <FaceBoxes faces={AFTER_FACES} at={FIXED} until={ZOOM_OUT - 4} />}
        </div>
      </div>
    </div>
  );
}

function PageUI() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pageIn = settle(frame, 0, fps);
  const letter = (i: number) => pop(frame, LETTER_AT[i], fps, 240, 12);
  const sheet = pop(frame, SHEET, fps) * map(frame, [FIXED + 20, FIXED + 30], [1, 0]);
  const fixed = pop(frame, FIXED, fps, 220, 12) * map(frame, [ZOOM_OUT, ZOOM_OUT + 10], [1, 0]);
  return (
    <div style={{ position: "absolute", inset: 0, transform: `translateY(${(1 - pageIn) * 140}px) rotate(${(1 - pageIn) * 3}deg)` }}>
      <div style={{ position: "absolute", inset: 0, background: C.surface, border: `3px solid ${C.ink}`, boxShadow: shadow(9) }} />
      <Panel id="p1" src="own/omar/bakery-panel.webp" position="50% 60%" at={PANEL_AT.p1} />
      <Panel id="p2" src="own/panels/basbousa-1.jpg" position="50% 100%" at={PANEL_AT.p2} />
      <Panel id="p4" src="own/panels/basbousa-3.jpg" position="50% 55%" at={PANEL_AT.p4} />
      <Panel id="p5" src="own/panels/basbousa-4.jpg" position="40% 60%" at={PANEL_AT.p5} />
      <Outlines />
      <Inset />
      {/* Lettering */}
      {frame >= LETTER_AT[0] ? <div style={{ position: "absolute", left: 34, top: 32, transform: `scale(${letter(0)})`, transformOrigin: "0 0" }}><CaptionBox style={{ fontSize: 21 }}>Forty minutes late. Again.</CaptionBox></div> : null}
      {frame >= LETTER_AT[1] ? <div style={{ position: "absolute", left: 420, top: 34, transform: `scale(${letter(1)})`, transformOrigin: "20% 100%" }}><Bubble style={{ maxWidth: 250 }}>You are too thin. Eat.</Bubble></div> : null}
      {frame >= LETTER_AT[2] ? <div style={{ position: "absolute", left: 34, top: 356, transform: `scale(${letter(2)})`, transformOrigin: "0 0" }}><CaptionBox style={{ fontSize: 21 }}>Mishmish, on chicken watch.</CaptionBox></div> : null}
      {frame >= LETTER_AT[3] ? <div style={{ position: "absolute", left: 34, top: 592, transform: `scale(${letter(3)})`, transformOrigin: "0 0" }}><CaptionBox style={{ fontSize: 21 }}>Then the lights went out.</CaptionBox></div> : null}
      {frame >= LETTER_AT[4] ? <div style={{ position: "absolute", left: 300, top: 442, transform: `scale(${letter(4)}) rotate(1deg)`, transformOrigin: "80% 100%", zIndex: 3 }}><Bubble tail="right" style={{ maxWidth: 260 }}>Teta, I swear I ate before I came!</Bubble></div> : null}

      {/* SAM's evidence while zoomed in */}
      {frame >= SHEET ? (
        <div style={{ position: "absolute", left: INSET.x - 230, top: INSET.y + 40, width: 200, transform: `scale(${sheet}) rotate(-3deg)`, transformOrigin: "100% 50%", zIndex: 4 }}>
          <div style={{ background: C.white, border: `3px solid ${C.ink}`, boxShadow: shadow(4), padding: 6 }}>
            <Img src={staticFile("art/cast/nour-sheet.webp")} style={{ width: "100%", display: "block" }} />
          </div>
          <div style={{ marginTop: 6, fontFamily: F.display, fontWeight: 700, fontSize: 17, color: C.ink, background: C.highlight, display: "inline-block", padding: "0 8px", border: `2px solid ${C.ink}` }}>Nour&apos;s sheet</div>
        </div>
      ) : null}
      {frame >= FIXED ? (
        <div style={{ position: "absolute", left: INSET.x - 20, top: INSET.y + INSET.size + 14, transform: `scale(${fixed})`, transformOrigin: "50% 0", zIndex: 4 }}>
          <Chip tone="calm" style={{ fontSize: 17 }}>Fixed: Nour redrawn from her sheet</Chip>
        </div>
      ) : null}
    </div>
  );
}

/** 6. The page builds in its manga layout; SAM 3.1 catches a face that drifted and it is redrawn. */
export function PageBuild() {
  const frame = useCurrentFrame();
  const { width, height, vertical } = useLayout();
  const box = uiBoxFor(width, height, 640, vertical ? 470 : 560);
  const target = fitPoint(box, PAGE.w, PAGE.h, INSET_CENTRE.x - (vertical ? 30 : 90), INSET_CENTRE.y + 10);
  const zoomTo = vertical ? 1.75 : 2.2;
  const z = map(frame, [ZOOM_IN, ZOOM_IN + 26, ZOOM_OUT, ZOOM_OUT + 28], [0, 1, 1, 0], cine);
  const scale = 1 + (zoomTo - 1) * z + map(frame, [0, ZOOM_IN], [0.03, 0]);
  // translate(t) scale(s) about the centre maps p to c + t + s(p - c): t = -s(p - c) puts p in the middle.
  const x = -(target.x - width / 2) * scale * z;
  const y = -(target.y - height / 2) * scale * z;
  const titleFade = map(frame, [ZOOM_IN, ZOOM_IN + 12, ZOOM_OUT + 10, ZOOM_OUT + 26], [1, 0, 0, 1]);
  const after = progress(frame, ZOOM_OUT + 30, 16);
  return (
    <AbsoluteFill>
      <Paper />
      <AbsoluteFill style={{ transform: `translate(${x}px, ${y}px) scale(${scale})`, transformOrigin: "50% 50%" }}>
        <StepFrame
          vTitleHeight={vertical ? 470 : 560}
          title={
            <div style={{ opacity: titleFade }}>
              <StepTitle
                step={5}
                kicker="Muse Image + SAM 3.1"
                title="Drawn as a real manga page"
                sub={frame > ZOOM_OUT + 20 ? "Every face is checked against the cast's sheets and redrawn if it drifts." : "Panels sized by the shot, slanted gutters, an inset close-up."}
                size={vertical ? 84 : 80}
                width={vertical ? 900 : 640}
              />
            </div>
          }
          ui={(b) => (
            <Fit w={PAGE.w} h={PAGE.h} box={b}>
              <PageUI />
            </Fit>
          )}
        />
      </AbsoluteFill>
      {frame >= ZOOM_OUT + 30 ? (
        <div style={{ position: "absolute", left: vertical ? 80 : 110, bottom: vertical ? 40 : 90, opacity: after, transform: `translateY(${(1 - after) * 14}px)` }}>
          <Chip tone="calm" style={{ fontSize: 24, padding: "8px 18px" }}>Same faces in every panel</Chip>
        </div>
      ) : null}
      {Object.values(PANEL_AT).map((at) => (
        <Sfx key={at} at={at} name="whoosh-short" volume={0.35} />
      ))}
      <Sfx at={PANEL_AT.p3 + 4} name="thud" volume={0.5} />
      {LETTER_AT.map((at) => (
        <Sfx key={`l${at}`} at={at} name="pop" volume={0.3} />
      ))}
      <Sfx at={ZOOM_IN} name="whoosh" volume={0.4} />
      <Sfx at={SCAN} name="tick1" volume={0.4} />
      <Sfx at={FACES} name="tick2" volume={0.4} />
      <Sfx at={FACES + 3} name="tick3" volume={0.4} />
      <Sfx at={FACES + 6} name="click" volume={0.5} />
      <Sfx at={FLIP} name="flip" volume={0.55} />
      <Sfx at={FIXED} name="sparkle" volume={0.5} />
      <Sfx at={ZOOM_OUT} name="whoosh" volume={0.35} />
    </AbsoluteFill>
  );
}
