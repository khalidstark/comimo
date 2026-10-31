import { AbsoluteFill, Img, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Camera, Chip, Fit, Paper, Sfx, StepFrame, StepTitle, TypingSfx, useLayout } from "../components/core";
import { C, F, shadow } from "../theme";
import { progress, settle, typed } from "../lib/anim";

const CARD_IN = 38;
const A1 = { at: 92, text: "The presentation, mostly." };
const A2 = { at: 142, text: "Karim saving me a seat on the train." };
export const CHECK_IN_DURATION = 222;

function Field({ label, answer, at, frame, appear }: { label: string; answer: string; at: number; frame: number; appear: number }) {
  const t = progress(frame, appear, 24);
  return (
    <div style={{ marginTop: 26, opacity: t, transform: `translateY(${(1 - t) * 16}px)` }}>
      <div style={{ fontFamily: F.body, fontWeight: 500, fontSize: 25, color: C.ink }}>{label}</div>
      <div style={{ marginTop: 10, minHeight: 64, padding: "14px 18px", boxSizing: "border-box", background: C.white, border: `2.5px solid ${C.calm}`, borderRadius: 14, fontFamily: F.lettering, fontSize: 25, color: C.ink }}>
        {typed(answer, frame, at, 0.9)}
      </div>
    </div>
  );
}

function CheckInUI() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const comic = settle(frame, 0, fps);
  const card = settle(frame, CARD_IN, fps);
  return (
    <div style={{ position: "absolute", inset: 0 }}>
      {/* A heavy day's comic */}
      <div style={{ position: "absolute", left: 0, top: 0, width: 440, transform: `translateY(${(1 - comic) * 80}px) rotate(-3deg)`, opacity: comic }}>
        <div style={{ background: C.surface, border: `3px solid ${C.ink}`, boxShadow: shadow(6), padding: 14 }}>
          <div style={{ fontFamily: F.display, fontWeight: 800, fontSize: 32, color: C.ink, lineHeight: 1.05 }}>The last train</div>
          <div style={{ marginTop: 6, display: "flex", gap: 8 }}>
            <Chip tone="paper" style={{ fontSize: 17, padding: "2px 12px 2px 3px" }}>
              <Img src={staticFile("art/site/mood-rainy.webp")} style={{ width: 28, height: 28 }} />
              Rainy day
            </Chip>
          </div>
          <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <Img src={staticFile("own/month/platform-0.jpg")} style={{ width: "100%", height: 150, objectFit: "cover", border: `2.5px solid ${C.ink}` }} />
            <Img src={staticFile("own/month/platform-1.jpg")} style={{ width: "100%", height: 150, objectFit: "cover", border: `2.5px solid ${C.ink}` }} />
          </div>
        </div>
      </div>

      {/* The check-in card: softer corners, teal, calm */}
      <div
        style={{
          position: "absolute",
          left: 150,
          top: 250,
          width: 750,
          height: 570,
          boxSizing: "border-box",
          padding: "36px 40px",
          background: C.calmWash,
          border: `3px solid ${C.calm}`,
          borderRadius: 22,
          boxShadow: `0 1px 0 rgba(27,33,72,0.06), 0 24px 50px -20px rgba(27,33,72,0.4)`,
          transform: `translateY(${(1 - card) * 260}px)`,
          opacity: Math.min(1, card * 1.4),
        }}
      >
        <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: 44, lineHeight: 1.12, color: C.calmText }}>That sounded like a lot. Want to sit with it for a moment?</div>
        <div style={{ marginTop: 12, fontFamily: F.body, fontSize: 22, color: C.inkSoft }}>Answer any, all or none. There are no right answers.</div>
        <Field label="What took the most out of you today?" answer={A1.text} at={A1.at} frame={frame} appear={CARD_IN + 26} />
        <Field label="Was there a moment, even a small one, that felt lighter?" answer={A2.text} at={A2.at} frame={frame} appear={CARD_IN + 50} />
      </div>
    </div>
  );
}

/** 7. On a heavy day, a gentle check-in card follows the comic. */
export function CheckIn() {
  const { vertical } = useLayout();
  return (
    <AbsoluteFill>
      <Paper tint="#e6eef0" />
      <Camera keys={[{ f: 0, scale: 1.0 }, { f: CHECK_IN_DURATION, scale: 1.05, y: vertical ? -20 : 0 }]}>
        <StepFrame
          title={<StepTitle step={6} kicker="On heavy days" title="A gentle check-in" sub="A few soft questions after the comic. No scores, no advice; the answers stay with that day." size={vertical ? 92 : 84} width={vertical ? 900 : 640} />}
          ui={(box) => (
            <Fit w={900} h={900} box={box}>
              <CheckInUI />
            </Fit>
          )}
        />
      </Camera>
      <Sfx at={2} name="thud" volume={0.3} />
      <Sfx at={CARD_IN} name="whoosh" volume={0.25} />
      <TypingSfx from={A1.at} to={A1.at + A1.text.length / 0.9} every={4} volume={0.14} />
      <TypingSfx from={A2.at} to={A2.at + A2.text.length / 0.9} every={4} volume={0.14} />
    </AbsoluteFill>
  );
}
