import { AbsoluteFill, Img, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Camera, CaptionBox, Card, Chip, Fit, Paper, Sfx, StepFrame, StepTitle, useLayout } from "../components/core";
import { C, F } from "../theme";
import { pop, progress, settle, typed } from "../lib/anim";
import { BEATS } from "../story";

const TITLE = "Basbousa and Candlelight";
const ROW_START = 40;
const ROW_GAP = 15;

/** Little slot shapes for each beat, like the page template's panels. */
const SLOT: Record<string, [number, number]> = {
  Establishing: [54, 54],
  Medium: [54, 54],
  "Close-up": [44, 44],
  Detail: [72, 26],
  Splash: [72, 48],
};

function ChapterUI() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const cardIn = settle(frame, 0, fps);
  const mood = pop(frame, 30, fps);
  return (
    <div style={{ position: "absolute", inset: 0, transform: `translateY(${(1 - cardIn) * 100}px) rotate(${(1 - cardIn) * -2}deg)`, opacity: Math.min(1, cardIn * 1.5) }}>
      <Card style={{ left: 0, top: 0, width: 900, height: 900 }}>
        <div style={{ padding: "38px 46px 0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Chip tone="calm">Muse Spark · the storyteller</Chip>
            <Chip tone="paper">Told as: Both</Chip>
          </div>
          <div style={{ marginTop: 18, fontFamily: F.display, fontWeight: 800, fontSize: 58, lineHeight: 1, color: C.ink, minHeight: 60 }}>
            {typed(TITLE, frame, 8, 1.4)}
          </div>
          <div style={{ marginTop: 14, display: "inline-flex", alignItems: "center", gap: 10, transform: `scale(${mood})`, transformOrigin: "0 50%" }}>
            <Chip tone="paper" style={{ padding: "3px 14px 3px 4px" }}>
              <Img src={staticFile("art/site/mood-sunny.webp")} style={{ width: 36, height: 36 }} />
              Sunny day
            </Chip>
            <span style={{ fontFamily: F.body, fontSize: 22, color: C.inkSoft }}>1 page · 5 panels · Zine</span>
          </div>
        </div>

        <div style={{ position: "absolute", left: 46, right: 46, top: 250, display: "grid", gap: 16 }}>
          {BEATS.map((beat, i) => {
            const at = ROW_START + i * ROW_GAP;
            const s = progress(frame, at, 14);
            const [w, h] = SLOT[beat.shot];
            return (
              <div
                key={beat.shot}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 18,
                  padding: "14px 18px",
                  minHeight: 92,
                  boxSizing: "border-box",
                  background: C.paper,
                  border: `2.5px solid ${C.ink}`,
                  borderRadius: "4px 7px 5px 6px",
                  opacity: s,
                  transform: `translateX(${(1 - s) * 80}px)`,
                }}
              >
                <span style={{ width: 80, display: "grid", placeItems: "center" }}>
                  <span style={{ width: w, height: h, border: `3px solid ${C.ink}`, background: beat.shot === "Splash" ? C.accent : C.surface, borderRadius: 3, transform: "rotate(-2deg)" }} />
                </span>
                <span style={{ width: 170 }}>
                  <div style={{ fontFamily: F.display, fontWeight: 800, fontSize: 22, color: C.inkSoft }}>Panel {i + 1}</div>
                  <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: 26, color: C.ink }}>{beat.shot}</div>
                </span>
                <span style={{ flex: 1 }}>
                  {beat.kind === "caption" ? (
                    <CaptionBox style={{ fontSize: 25 }}>{typed(beat.text, frame, at + 4, 1.6)}</CaptionBox>
                  ) : (
                    <span style={{ fontFamily: F.lettering, fontSize: 25, color: C.ink, lineHeight: 1.3 }}>{typed(beat.text, frame, at + 4, 1.6)}</span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

/** 3. Muse Spark retells the day as a chapter: beats, shots and lettering. */
export function Storyteller() {
  const { vertical } = useLayout();
  return (
    <AbsoluteFill>
      <Paper />
      <Camera keys={[{ f: 0, scale: 1.05, x: vertical ? 0 : 30 }, { f: 180, scale: 1.0 }]}>
        <StepFrame
          title={<StepTitle step={2} kicker="Muse Spark" title="Your day, told like a chapter" sub="It picks the moments worth drawing, the shots, and every caption and line." size={vertical ? 92 : 84} width={vertical ? 900 : 640} />}
          ui={(box) => (
            <Fit w={900} h={900} box={box}>
              <ChapterUI />
            </Fit>
          )}
        />
      </Camera>
      <Sfx at={2} name="whoosh-short" volume={0.4} />
      <Sfx at={30} name="pop" volume={0.4} />
      {BEATS.map((_, i) => (
        <Sfx key={i} at={ROW_START + i * ROW_GAP} name="tick2" volume={0.5} />
      ))}
    </AbsoluteFill>
  );
}
