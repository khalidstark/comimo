import { AbsoluteFill, Img, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { CaptionBox, Sfx, useLayout } from "../components/core";
import { C, F } from "../theme";
import { map, pop, progress } from "../lib/anim";

/** 1. The zine's night cover: Nour recording her day, the promise in big type. */
export function Hook() {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const { vertical, width } = useLayout();
  const zoom = map(frame, [0, durationInFrames], [1.16, 1.02]);
  const pan = map(frame, [0, durationInFrames], [vertical ? -40 : -60, 0]);
  const lines = [
    { text: "Talk about", at: 14 },
    { text: "your day.", at: 22 },
    { text: "Get a comic.", at: 44 },
  ];
  const logo = pop(frame, 4, fps);
  const kicker = pop(frame, 8, fps);
  const sub = progress(frame, 70, 20);
  const size = vertical ? 132 : 128;

  return (
    <AbsoluteFill style={{ background: C.night, overflow: "hidden" }}>
      <AbsoluteFill style={{ transform: `scale(${zoom}) translateX(${pan}px)` }}>
        <Img
          src={staticFile("art/site/hero-night.webp")}
          style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: vertical ? "64% 50%" : "70% 50%" }}
        />
      </AbsoluteFill>
      {/* The site's hero falloff: the night band behind the words. */}
      <AbsoluteFill
        style={{
          background: vertical
            ? `linear-gradient(180deg, ${C.night} 0%, rgba(20,25,56,0.92) 30%, rgba(20,25,56,0.25) 58%, rgba(20,25,56,0) 70%)`
            : `linear-gradient(90deg, ${C.night} 0%, rgba(20,25,56,0.9) 34%, rgba(20,25,56,0.1) 60%, rgba(20,25,56,0) 70%)`,
        }}
      />

      <div style={{ position: "absolute", left: vertical ? 80 : 130, top: 70, display: "flex", alignItems: "center", gap: 14, transform: `scale(${logo})`, transformOrigin: "0 50%" }}>
        <Img src={staticFile("art/site/logo-mimo.png")} style={{ width: 64, height: 64 }} />
        <span style={{ fontFamily: F.display, fontWeight: 800, fontSize: 48, color: C.onNight, letterSpacing: "-0.02em" }}>comimo</span>
      </div>

      <div style={{ position: "absolute", left: vertical ? 80 : 130, top: vertical ? 230 : 250, width: vertical ? width - 160 : 900 }}>
        <div style={{ transform: `scale(${kicker}) rotate(-1.5deg)`, transformOrigin: "0 50%" }}>
          <CaptionBox style={{ fontFamily: F.display, fontWeight: 700, fontSize: 30 }}>Tonight, before you sleep</CaptionBox>
        </div>
        <h1 style={{ margin: "26px 0 0", fontFamily: F.display, fontWeight: 800, fontSize: size, lineHeight: 0.98, letterSpacing: "-0.025em", color: C.onNight }}>
          {lines.map((line) => {
            const t = progress(frame, line.at, 20);
            const hit = line.text === "Get a comic." ? pop(frame, line.at, fps, 220, 11) : 1;
            return (
              <span key={line.text} style={{ display: "block", overflow: "hidden", paddingBottom: "0.06em" }}>
                <span
                  style={{
                    display: "inline-block",
                    transform: `translateY(${(1 - t) * 110}%) scale(${line.text === "Get a comic." ? 0.85 + hit * 0.15 : 1})`,
                    transformOrigin: "0 100%",
                    color: line.text === "Get a comic." ? C.highlight : C.onNight,
                  }}
                >
                  {line.text}
                </span>
              </span>
            );
          })}
        </h1>
        <p style={{ margin: "30px 0 0", maxWidth: 680, fontFamily: F.body, fontSize: 34, lineHeight: 1.4, color: C.onNightSoft, opacity: sub, transform: `translateY(${(1 - sub) * 16}px)` }}>
          Here is how one evening becomes a comic.
        </p>
      </div>

      <Sfx at={12} name="whoosh" volume={0.45} />
      <Sfx at={44} name="pop" volume={0.5} />
    </AbsoluteFill>
  );
}
