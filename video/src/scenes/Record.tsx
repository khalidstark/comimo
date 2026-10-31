import { AbsoluteFill, Img, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Button, Camera, CaptionBox, Card, Chip, Cursor, Fit, Paper, Sfx, StepFrame, StepTitle, TypingSfx, useLayout } from "../components/core";
import { C, F, shadow } from "../theme";
import { map, pop, progress, settle } from "../lib/anim";
import { SCRIPT, SCRIPT_TEXT } from "../story";

const TYPE_START = 50;
const CPS = 2.5;
const TYPE_END = TYPE_START + Math.ceil(SCRIPT_TEXT.length / CPS);
const MAKE_CLICK = TYPE_END + 34;

const PORTRAIT: Record<string, string> = {
  teta: "art/site/portrait-teta.webp",
  karim: "art/site/portrait-karim.webp",
  mishmish: "art/site/portrait-mishmish.webp",
};
const NAMES: Record<string, string> = { teta: "Teta Samia", karim: "Karim", mishmish: "Mishmish", omar: "Omar", cashier: "the cashier" };

/** Frame at which each named segment finishes typing. */
const NAMED = (() => {
  let chars = 0;
  const out: { key: string; at: number; known: boolean }[] = [];
  for (const segment of SCRIPT) {
    chars += segment.t.length;
    const key = segment.who ?? segment.unknown;
    if (key && !out.some((o) => o.key === key)) out.push({ key, at: TYPE_START + chars / CPS, known: Boolean(segment.who) });
  }
  return out;
})();

/** The typed script with cast names underlined in pink and unknown names marked in sunflower. */
function TypedScript({ frame }: { frame: number }) {
  let budget = Math.max(0, Math.floor((frame - TYPE_START) * CPS));
  const caretOn = frame < TYPE_END + 10 && Math.floor(frame / 8) % 2 === 0;
  return (
    <span>
      {SCRIPT.map((segment, i) => {
        if (budget <= 0) return null;
        const shown = segment.t.slice(0, budget);
        budget -= segment.t.length;
        const style = segment.who
          ? { backgroundImage: `linear-gradient(transparent 68%, rgba(242,57,122,0.45) 68%)`, fontWeight: 600 }
          : segment.unknown
            ? { background: C.highlight, borderRadius: 6, padding: "0 4px", fontWeight: 600, boxShadow: `0 0 0 2px ${C.ink}` }
            : {};
        return (
          <span key={i} style={style}>
            {shown}
          </span>
        );
      })}
      <span style={{ display: "inline-block", width: 3, height: "1.1em", marginLeft: 2, verticalAlign: "-0.15em", background: caretOn ? C.accent : "transparent" }} />
    </span>
  );
}

function RecordUI() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const cardIn = settle(frame, 0, fps);
  const callout = pop(frame, 20, fps) * map(frame, [42, 50], [1, 0]);
  const focused = frame >= 42;
  const reading = frame >= MAKE_CLICK + 4;
  const readIn = pop(frame, MAKE_CLICK + 6, fps);

  return (
    <div style={{ position: "absolute", inset: 0, transform: `translateY(${(1 - cardIn) * 120}px)`, opacity: Math.min(1, cardIn * 1.5) }}>
      <Card style={{ left: 0, top: 0, width: 900, height: 900 }}>
        <div style={{ padding: "40px 48px 0" }}>
          <div style={{ fontFamily: F.body, fontWeight: 600, fontSize: 20, color: C.accentText, letterSpacing: "0.08em", textTransform: "uppercase" }}>● Friday 30 October</div>
          <div style={{ marginTop: 8, fontFamily: F.display, fontWeight: 800, fontSize: 60, lineHeight: 1, color: C.ink }}>Tell me about today</div>
          <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 14 }}>
            <Chip>Mixed / auto</Chip>
            <Chip tone="paper">عربي</Chip>
            <Chip tone="paper">English</Chip>
            <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10, fontFamily: F.display, fontWeight: 700, fontSize: 22, color: C.inkSoft }}>
              <span style={{ display: "inline-grid", placeItems: "center", width: 44, height: 44, borderRadius: 999, background: C.accent, border: `3px solid ${C.ink}` }}>
                <svg width="20" height="22" viewBox="0 0 20 22">
                  <rect x="6" y="1" width="8" height="13" rx="4" fill={C.ink} />
                  <path d="M3 10 a7 7 0 0 0 14 0 M10 17 v4" stroke={C.ink} strokeWidth="2.4" fill="none" strokeLinecap="round" />
                </svg>
              </span>
              or record it
            </span>
          </div>
        </div>

        {/* The script box */}
        <div
          style={{
            position: "absolute",
            left: 48,
            top: 250,
            width: 804,
            height: 400,
            padding: "22px 26px",
            boxSizing: "border-box",
            background: focused ? C.white : C.paper,
            border: `3px solid ${C.ink}`,
            borderRadius: 14,
            boxShadow: focused ? `0 0 0 5px rgba(242,57,122,0.35)` : "none",
            fontFamily: F.body,
            fontSize: 28,
            lineHeight: 1.5,
            color: C.ink,
          }}
        >
          {frame < TYPE_START ? <span style={{ color: C.inkSoft }}>Type or paste your day here…</span> : <TypedScript frame={frame} />}
        </div>
        <div style={{ position: "absolute", left: 48, top: 214, fontFamily: F.display, fontWeight: 700, fontSize: 24, color: C.ink }}>Your day, in your words</div>

        {/* Names Comimo noticed */}
        <div style={{ position: "absolute", left: 48, top: 668, right: 48, display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
          {NAMED.map(({ key, at, known }) => {
            const s = pop(frame, at, fps, 260, 14);
            if (frame < at) return null;
            return (
              <span key={key} style={{ transform: `scale(${s})`, display: "inline-flex" }}>
                <Chip tone={known ? "paper" : "highlight"} style={{ fontSize: 20, padding: "3px 12px 3px 4px" }}>
                  {known ? (
                    <Img src={staticFile(PORTRAIT[key])} style={{ width: 34, height: 34, borderRadius: 999, objectFit: "cover", objectPosition: "50% 15%", border: `2px solid ${C.ink}`, background: C.paperDeep }} />
                  ) : (
                    <span style={{ display: "inline-grid", placeItems: "center", width: 34, height: 34, borderRadius: 999, background: C.white, border: `2px solid ${C.ink}`, fontWeight: 800 }}>?</span>
                  )}
                  {NAMES[key]}
                </Chip>
              </span>
            );
          })}
        </div>

        <div style={{ position: "absolute", left: 48, bottom: 40, display: "flex", alignItems: "center", gap: 18 }}>
          <Button pressedAt={MAKE_CLICK} style={{ fontSize: 30, padding: "14px 30px" }}>
            {reading ? "Making your comic…" : "Make my comic"}
          </Button>
          {reading ? (
            <span style={{ transform: `scale(${readIn})`, display: "inline-flex" }}>
              <Chip tone="calm">Muse Spark is reading your day</Chip>
            </span>
          ) : null}
        </div>
      </Card>

      {/* "Press here" call-out */}
      <div style={{ position: "absolute", left: 360, top: 196, transform: `scale(${callout}) rotate(3deg)`, transformOrigin: "20% 100%" }}>
        <CaptionBox style={{ fontFamily: F.display, fontWeight: 800, fontSize: 30, background: C.accent, boxShadow: shadow(3) }}>Press here ↓</CaptionBox>
      </div>

      <Cursor
        appear={14}
        keys={[
          { f: 14, x: 760, y: 860 },
          { f: 40, x: 420, y: 400, click: true },
          { f: 60, x: 840, y: 640 },
          { f: TYPE_END + 10, x: 840, y: 660 },
          { f: MAKE_CLICK, x: 200, y: 836, click: true },
          { f: MAKE_CLICK + 30, x: 300, y: 880 },
        ]}
      />
    </div>
  );
}

/** 2. Tap the box and the day's script types itself in; names are spotted as they appear. */
export function Record() {
  const { vertical } = useLayout();
  return (
    <AbsoluteFill>
      <Paper />
      <Camera keys={[{ f: 0, scale: 1.03, y: 10 }, { f: 120, scale: 1.0 }, { f: 300, scale: 1.04, x: vertical ? 0 : -20 }]}>
        <StepFrame
          title={<StepTitle step={1} kicker="Write or say it" title={"Talk about\nyour day"} sub="Press the box and add your script. Arabic, English or both; Comimo spots the people in it." size={vertical ? 92 : 88} width={vertical ? 900 : 640} />}
          ui={(box) => (
            <Fit w={900} h={900} box={box}>
              <RecordUI />
            </Fit>
          )}
        />
      </Camera>
      <Sfx at={40} name="click" />
      <TypingSfx from={TYPE_START} to={TYPE_END} every={3} />
      {NAMED.map(({ key, at }) => (
        <Sfx key={key} at={at} name="pop" volume={0.35} />
      ))}
      <Sfx at={MAKE_CLICK} name="click" />
      <Sfx at={MAKE_CLICK + 6} name="sparkle" volume={0.25} />
    </AbsoluteFill>
  );
}

export const RECORD_DURATION = MAKE_CLICK + 60;
