import { AbsoluteFill, Img, random, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { CaptionBox, Sfx, useLayout } from "../components/core";
import { C, F, shadow } from "../theme";
import { cine, inkEase, map, pop, progress, settle } from "../lib/anim";

type Mood = "sunny" | "cloudy" | "rainy" | "stormy" | "rainbow";
const STORIES: { key: string; title: string; mood: Mood }[] = [
  { key: "zine4", title: "Teta's birthday, round two", mood: "rainbow" },
  { key: "lunch", title: "Molokhia for Karim", mood: "sunny" },
  { key: "spark", title: "A slow Saturday", mood: "cloudy" },
  { key: "zine6", title: "Mishmish vs. the pigeon", mood: "sunny" },
  { key: "platform", title: "The last train", mood: "rainy" },
  { key: "market", title: "Teta learns video calls", mood: "sunny" },
  { key: "roof", title: "Tea on the roof", mood: "cloudy" },
  { key: "office", title: "The night market", mood: "rainbow" },
  { key: "cinema", title: "Rooftop cinema", mood: "sunny" },
  { key: "felucca", title: "Corn and felucca lights", mood: "rainbow" },
  { key: "roofzine", title: "Tea on the roof, again", mood: "cloudy" },
  { key: "lunchp", title: "Sunday lunch", mood: "sunny" },
];

/** 22 days of October with a comic, each landing faster than the last. */
const N = 22;
const COMIC_DAYS = [1, 2, 4, 5, 6, 8, 9, 11, 12, 13, 15, 16, 18, 19, 20, 22, 23, 25, 26, 27, 29, 30];
const LAND = Array.from({ length: N }, (_, k) => Math.round(30 + 236 * (k / N) ** 0.62));
const FLY = (k: number) => Math.max(8, 16 - k * 0.4);
const SQUEEZE = 280;
const SNAP = 292;
const END_CARD = 372;
export const FINALE_DURATION = 460;

function Tile({ k, width }: { k: number; width: number }) {
  const story = STORIES[k % STORIES.length];
  const h = width * 1.32;
  const pad = width * 0.045;
  return (
    <div style={{ width, height: h, boxSizing: "border-box", background: C.surface, border: `3px solid ${C.ink}`, padding: pad, boxShadow: "0 2px 0 rgba(27,33,72,0.2)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <Img src={staticFile(`art/site/mood-${story.mood}.webp`)} style={{ width: width * 0.11, height: width * 0.11 }} />
        <span style={{ fontFamily: F.display, fontWeight: 800, fontSize: width * 0.075, color: C.ink, lineHeight: 1.05, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{story.title}</span>
      </div>
      <div style={{ marginTop: pad * 0.8, display: "grid", gridTemplateColumns: "1.2fr 1fr", gridTemplateRows: "1fr 1fr", gap: pad * 0.6, height: h - width * 0.2 - pad * 2 }}>
        <Img src={staticFile(`own/month/${story.key}-0.jpg`)} style={{ gridColumn: "1 / 3", width: "100%", height: "100%", objectFit: "cover", border: `2px solid ${C.ink}`, boxSizing: "border-box" }} />
        <Img src={staticFile(`own/month/${story.key}-1.jpg`)} style={{ width: "100%", height: "100%", objectFit: "cover", border: `2px solid ${C.ink}`, boxSizing: "border-box" }} />
        <Img src={staticFile(`own/month/${story.key}-2.jpg`)} style={{ width: "100%", height: "100%", objectFit: "cover", border: `2px solid ${C.ink}`, boxSizing: "border-box" }} />
      </div>
    </div>
  );
}

function Cover({ width }: { width: number }) {
  const h = width * 1.5;
  return (
    <div style={{ position: "relative", width, height: h, border: `4px solid ${C.ink}`, overflow: "hidden", boxShadow: `9px 9px 0 -3px ${C.surface}, 9px 9px 0 0 ${C.ink}, 18px 18px 0 -3px ${C.surface}, 18px 18px 0 0 ${C.ink}` }}>
      <Img src={staticFile("own/cover-2026-10.jpg")} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
      <div style={{ position: "absolute", top: width * 0.03, left: 0, right: 0, textAlign: "center", fontFamily: F.display, fontWeight: 800, fontSize: width * 0.25, lineHeight: 1, letterSpacing: "-0.03em", color: C.ink, textShadow: `0 0 0 ${C.ink}` }}>comimo</div>
      <div style={{ position: "absolute", top: width * 0.3, left: "50%", transform: "translateX(-50%)", padding: "2px 12px", background: C.white, border: `2px solid ${C.ink}`, fontFamily: F.display, fontWeight: 700, fontSize: width * 0.045, color: C.ink, whiteSpace: "nowrap" }}>OCTOBER 2026 · 22 DAYS</div>
      <div style={{ position: "absolute", left: width * 0.04, bottom: width * 0.3, maxWidth: width * 0.75, padding: "6px 12px", background: C.accent, border: `2.5px solid ${C.ink}`, fontFamily: F.display, fontWeight: 800, fontSize: width * 0.07, lineHeight: 1.05, color: C.ink, transform: "rotate(-2deg)" }}>
        Basbousa, candlelight and one missing bus!
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: `${width * 0.03}px ${width * 0.05}px`, background: C.ink, color: C.white, fontFamily: F.lettering, fontSize: width * 0.04, lineHeight: 1.35 }}>
        <div>◆ Teta&apos;s birthday, round two</div>
        <div>◆ Omar joins the cast</div>
        <div>◆ The last train home</div>
      </div>
    </div>
  );
}

/** Mimo waving, from the site's sprite sheet (6 x 4 frames: idle, blink, talk, wave). */
function Mimo({ size, frame }: { size: number; frame: number }) {
  const col = Math.floor(frame / 4) % 6;
  const fw = size;
  const fh = size * 0.9;
  return <div style={{ width: fw, height: fh, backgroundImage: `url(${staticFile("art/site/sprite-mimo.webp")})`, backgroundSize: `${fw * 6}px ${fh * 4}px`, backgroundPosition: `${-col * fw}px ${-3 * fh}px` }} />;
}

/** 8. The month speeds by, the comics stack up and snap into one magazine; then the logo. */
export function Finale() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { width, height, vertical } = useLayout();
  const cx = width / 2 + (vertical ? 0 : 200);
  const cy = height / 2 + (vertical ? 60 : 10);
  const tileW = vertical ? 470 : 400;

  // Which day it is: the latest comic that has landed.
  const landed = LAND.filter((t) => frame >= t).length;
  const day = landed === 0 ? 1 : COMIC_DAYS[landed - 1];
  const squeeze = progress(frame, SQUEEZE, SNAP - SQUEEZE, inkEase);
  const snap = settle(frame, SNAP, fps);
  const flash = map(frame, [SNAP, SNAP + 10], [0.85, 0]);
  const shake = frame >= SNAP && frame < SNAP + 10 ? (random(`s${frame}`) - 0.5) * 22 * (1 - (frame - SNAP) / 10) : 0;
  const coverTilt = map(frame, [SNAP, END_CARD], [-16, -4], cine);
  const counter = pop(frame, LAND[Math.max(0, landed - 1)], fps, 300, 14);
  const intro = progress(frame, 0, 18);
  const boundLine = progress(frame, SNAP + 18, 20);

  // End card wipes in like the next panel.
  const wipe = progress(frame, END_CARD, 20, inkEase);
  const slant = height * 0.22;
  const edge = map(wipe, [0, 1], [width + 40, -slant - 40]);

  const zoom = map(frame, [0, SQUEEZE], [1.0, 1.06]) * (frame >= SNAP ? map(frame, [SNAP, END_CARD], [1.0, 1.04]) : 1);

  return (
    <AbsoluteFill style={{ background: `radial-gradient(ellipse at 60% 40%, #222a5c 0%, ${C.night} 55%, ${C.nightDeep} 100%)`, overflow: "hidden" }}>
      <AbsoluteFill style={{ transform: `translate(${shake}px, ${shake * 0.6}px) scale(${zoom})` }}>
        {/* Night-print dots */}
        <AbsoluteFill style={{ backgroundImage: "radial-gradient(rgba(244,245,250,0.07) 1.4px, transparent 1.7px)", backgroundSize: "18px 18px" }} />

        {/* Title + date counter */}
        <div style={{ position: "absolute", left: vertical ? 80 : 110, top: vertical ? 130 : 150, opacity: intro * (frame < SNAP ? 1 : map(frame, [SNAP, SNAP + 8], [1, 0])) }}>
          <CaptionBox style={{ fontFamily: F.display, fontWeight: 700, fontSize: 28 }}>All month long</CaptionBox>
          <div style={{ marginTop: 20, fontFamily: F.display, fontWeight: 800, fontSize: vertical ? 84 : 92, lineHeight: 1, color: C.onNight }}>
            One comic
            <br />a day…
          </div>
          <div style={{ marginTop: 30, fontFamily: F.display, fontWeight: 800, fontSize: vertical ? 120 : 150, lineHeight: 1, color: C.highlight, transform: `scale(${0.85 + 0.15 * counter})`, transformOrigin: "0 50%", fontVariantNumeric: "tabular-nums" }}>
            Oct {day}
          </div>
        </div>

        {/* The stack */}
        {frame < SNAP + 2
          ? LAND.map((t, k) => {
              const fly = FLY(k);
              if (frame < t - fly) return null;
              const p = progress(frame, t - fly, fly, cine);
              const dir = random(`dir${k}`) * Math.PI * 2;
              const dist = Math.max(width, height) * 0.9;
              const fromX = Math.cos(dir) * dist;
              const fromY = Math.sin(dir) * dist;
              const rest = (random(`rot${k}`) - 0.5) * 14;
              const ox = (random(`ox${k}`) - 0.5) * 30;
              const oy = -k * 2.2;
              const x = fromX * (1 - p) + ox * (1 - squeeze);
              const y = fromY * (1 - p) + oy * (1 - squeeze);
              const r = rest * (1 - squeeze) + (1 - p) * (random(`spin${k}`) - 0.5) * 120;
              const sc = (1 + (1 - p) * 0.4) * (1 - squeeze * 0.12);
              return (
                <div key={k} style={{ position: "absolute", left: cx - tileW / 2, top: cy - (tileW * 1.32) / 2, transform: `translate(${x}px, ${y}px) rotate(${r}deg) scale(${sc}) scaleY(${1 - squeeze * 0.75})`, boxShadow: shadow(6, "rgba(0,0,0,0.35)") }}>
                  <Tile k={k} width={tileW} />
                </div>
              );
            })
          : null}

        {/* The magazine */}
        {frame >= SNAP ? (
          <div style={{ position: "absolute", left: cx - (vertical ? 330 : 300), top: cy - (vertical ? 495 : 450), perspective: 1600 }}>
            <div style={{ transform: `scale(${0.55 + snap * 0.45}) rotateY(${coverTilt}deg) rotate(-3deg)`, transformOrigin: "50% 50%" }}>
              <Cover width={vertical ? 660 : 600} />
            </div>
          </div>
        ) : null}
        {frame >= SNAP + 18 ? (
          <div style={{ position: "absolute", left: vertical ? 80 : 110, top: vertical ? 120 : 330, width: vertical ? width - 160 : 640, opacity: boundLine, transform: `translateY(${(1 - boundLine) * 20}px)` }}>
            <CaptionBox style={{ fontFamily: F.display, fontWeight: 700, fontSize: 28 }}>October 31</CaptionBox>
            <div style={{ marginTop: 20, fontFamily: F.display, fontWeight: 800, fontSize: vertical ? 80 : 84, lineHeight: 1.0, color: C.onNight }}>Your month, bound as a magazine.</div>
          </div>
        ) : null}

        {/* Month at a glance: the weather strip fills in as comics land */}
        {frame < SNAP ? (
          <div style={{ position: "absolute", left: vertical ? 40 : 110, right: vertical ? 40 : 110, bottom: vertical ? 110 : 60, display: "grid", gridTemplateColumns: "repeat(31, 1fr)", gap: vertical ? 4 : 6, opacity: intro * (1 - squeeze) }}>
            {Array.from({ length: 31 }, (_, i) => {
              const d = i + 1;
              const k = COMIC_DAYS.indexOf(d);
              const on = k !== -1 && frame >= LAND[k];
              const s = on ? pop(frame, LAND[k], fps, 300, 12) : 0;
              const mood = k !== -1 ? STORIES[k % STORIES.length].mood : null;
              return (
                <div key={d} style={{ aspectRatio: "1 / 1.25", borderRadius: 6, border: `2px solid rgba(195,200,226,${d <= day ? 0.6 : 0.25})`, display: "grid", placeItems: "center", position: "relative" }}>
                  {mood && on ? <Img src={staticFile(`art/site/mood-${mood}.webp`)} style={{ width: "88%", transform: `scale(${s})` }} /> : null}
                  <span style={{ position: "absolute", bottom: -24, fontFamily: F.body, fontSize: vertical ? 13 : 15, color: C.onNightSoft, opacity: d % 5 === 1 ? 1 : 0 }}>{d}</span>
                </div>
              );
            })}
          </div>
        ) : null}
        <AbsoluteFill style={{ background: C.white, opacity: frame >= SNAP ? flash : 0, mixBlendMode: "screen" }} />
      </AbsoluteFill>

      {/* End card */}
      {frame >= END_CARD ? (
        <AbsoluteFill style={{ clipPath: `polygon(${edge + slant}px 0, ${width + 400}px 0, ${width + 400}px ${height}px, ${edge}px ${height}px)`, background: C.paper }}>
          <AbsoluteFill style={{ backgroundImage: `radial-gradient(${C.dot} 1.4px, transparent 1.7px)`, backgroundSize: "16px 16px" }} />
          <AbsoluteFill style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 24 }}>
            <div style={{ transform: `scale(${pop(frame, END_CARD + 12, fps)})` }}>
              <Mimo size={vertical ? 260 : 220} frame={frame} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 18, transform: `scale(${pop(frame, END_CARD + 18, fps)})` }}>
              <span style={{ fontFamily: F.display, fontWeight: 800, fontSize: vertical ? 150 : 140, lineHeight: 1, letterSpacing: "-0.03em", color: C.ink }}>comimo</span>
            </div>
            <div style={{ textAlign: "center", fontFamily: F.display, fontWeight: 800, fontSize: vertical ? 64 : 68, lineHeight: 1.05, color: C.ink, padding: "0 60px" }}>
              {["Talk", "about", "your", "day."].map((w, i) => {
                const t = progress(frame, END_CARD + 30 + i * 4, 16);
                return (
                  <span key={w} style={{ display: "inline-block", overflow: "hidden", verticalAlign: "top", marginRight: "0.24em", paddingBottom: "0.08em" }}>
                    <span style={{ display: "inline-block", transform: `translateY(${(1 - t) * 105}%)` }}>{w}</span>
                  </span>
                );
              })}
              {vertical ? <br /> : null}
              {["Get", "a", "comic."].map((w, i) => {
                const t = progress(frame, END_CARD + 48 + i * 4, 16);
                return (
                  <span key={w} style={{ display: "inline-block", overflow: "hidden", verticalAlign: "top", marginRight: "0.24em", paddingBottom: "0.08em" }}>
                    <span style={{ display: "inline-block", transform: `translateY(${(1 - t) * 105}%)`, color: C.accentText }}>{w}</span>
                  </span>
                );
              })}
            </div>
            <div style={{ opacity: progress(frame, END_CARD + 66, 16), fontFamily: F.body, fontSize: 26, color: C.inkSoft, textAlign: "center", padding: "0 60px" }}>
              Built with Muse Spark, Muse Image and SAM 3.1
            </div>
          </AbsoluteFill>
          {/* The gutter riding the wipe edge */}
        </AbsoluteFill>
      ) : null}
      {frame >= END_CARD && wipe < 1 ? (
        <AbsoluteFill style={{ clipPath: `polygon(${edge + slant - 10}px 0, ${edge + slant + 6}px 0, ${edge + 6}px ${height}px, ${edge - 10}px ${height}px)`, background: C.ink }} />
      ) : null}

      {LAND.map((t, k) => (
        <Sfx key={k} at={t - 4} name="whoosh-short" volume={Math.max(0.12, 0.42 - k * 0.012)} />
      ))}
      {LAND.map((t, k) => (k % 2 === 0 ? <Sfx key={`p${k}`} at={t} name="tick2" volume={0.25} /> : null))}
      <Sfx at={SNAP - 96} name="riser" volume={0.55} />
      <Sfx at={SNAP} name="snap" volume={0.9} />
      <Sfx at={END_CARD} name="flip" volume={0.5} />
      <Sfx at={END_CARD + 18} name="pop" volume={0.5} />
      <Sfx at={END_CARD + 50} name="sparkle" volume={0.35} />
    </AbsoluteFill>
  );
}
