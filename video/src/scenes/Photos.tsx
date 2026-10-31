import { AbsoluteFill, Img, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Button, Camera, CaptionBox, Card, Chip, Cursor, Fit, Paper, Sfx, StepFrame, StepTitle, useLayout } from "../components/core";
import { QrCode } from "../components/QrCode";
import { C, F, shadow } from "../theme";
import { inkEase, map, pop, progress, settle } from "../lib/anim";

const ADD_CLICK = 30;
const DROPS = [44, 58, 72];
const TO_PAGE = 112;
const QR_LAND = 146;
export const PHOTOS_DURATION = 230;

const PHOTOS = [
  { src: "own/photos/basbousa.webp", x: 70, y: 330, r: -8 },
  { src: "own/photos/candles.webp", x: 320, y: 300, r: 3 },
  { src: "own/photos/mishmish.webp", x: 570, y: 340, r: 9 },
];

function Polaroid({ src, size }: { src: string; size: number }) {
  return (
    <div style={{ width: size, padding: "12px 12px 44px", background: C.white, border: `2px solid ${C.ink}`, boxShadow: shadow(5), boxSizing: "content-box" }}>
      <Img src={staticFile(src)} style={{ width: size, height: size, objectFit: "cover", display: "block" }} />
    </div>
  );
}

function PhotosUI() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const cardIn = settle(frame, 0, fps);
  const toPage = progress(frame, TO_PAGE, 22, inkEase);
  const pageIn = settle(frame, TO_PAGE + 6, fps);
  const qr = pop(frame, QR_LAND, fps, 240, 12);
  const qrLabel = progress(frame, QR_LAND + 12, 14);

  // The last page of the comic, where the album's code goes.
  const page = { x: 150, y: 40, w: 600, h: 820 };
  return (
    <div style={{ position: "absolute", inset: 0 }}>
      {/* Ask card */}
      <div style={{ position: "absolute", inset: 0, transform: `translateY(${(1 - cardIn) * 110}px) translateX(${-toPage * 1500}px) rotate(${-toPage * 8}deg)`, opacity: Math.min(1, cardIn * 1.5) * (1 - toPage) }}>
        <Card style={{ left: 0, top: 0, width: 900, height: 900 }}>
          <div style={{ padding: "40px 46px" }}>
            <div style={{ fontFamily: F.display, fontWeight: 800, fontSize: 56, lineHeight: 1, color: C.ink }}>Add real photos?</div>
            <div style={{ marginTop: 14, fontFamily: F.body, fontSize: 25, lineHeight: 1.45, color: C.inkSoft, width: 780 }}>
              Pictures from the day go in an album. A code on the last page opens it.
            </div>
            <div style={{ marginTop: 26, display: "flex", gap: 18 }}>
              <Button pressedAt={ADD_CLICK}>Add photos</Button>
              <Button tone="ghost">Skip</Button>
            </div>
          </div>
        </Card>
        {PHOTOS.map((p, i) => {
          const d = settle(frame, DROPS[i], fps);
          if (frame < DROPS[i] - 2 || frame >= TO_PAGE) return null;
          return (
            <div key={p.src} style={{ position: "absolute", left: p.x, top: p.y, transform: `translateY(${(1 - d) * -700}px) rotate(${p.r + (1 - d) * 20}deg) scale(${1 + (1 - d) * 0.3})` }}>
              <Polaroid src={p.src} size={230} />
            </div>
          );
        })}
      </div>

      {/* The last page */}
      {frame >= TO_PAGE ? (
        <div style={{ position: "absolute", left: page.x, top: page.y, width: page.w, height: page.h, transform: `translateX(${(1 - pageIn) * 900}px) rotate(${(1 - pageIn) * 8}deg)` }}>
          <div style={{ position: "absolute", inset: 0, background: C.surface, border: `3px solid ${C.ink}`, boxShadow: shadow(8) }}>
            <div style={{ position: "absolute", left: 22, top: 22, right: 22, height: 460, border: `3px solid ${C.ink}`, overflow: "hidden", borderRadius: "4px 7px 5px 6px" }}>
              <Img src={staticFile("own/panels/basbousa-5.jpg")} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "60% 60%" }} />
              <div style={{ position: "absolute", left: 14, top: 14 }}>
                <CaptionBox>Walking home, full and happy.</CaptionBox>
              </div>
            </div>
            <div style={{ position: "absolute", left: 22, top: 500, right: 22, height: 120, border: `3px solid ${C.ink}`, overflow: "hidden", borderRadius: "4px 7px 5px 6px" }}>
              <Img src={staticFile("own/panels/basbousa-3.jpg")} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "50% 50%" }} />
            </div>
            <div style={{ position: "absolute", left: 30, bottom: 40, fontFamily: F.lettering, fontWeight: 600, fontSize: 40, color: C.ink }}>The end.</div>
            <div style={{ position: "absolute", left: 30, bottom: 18, fontFamily: F.body, fontSize: 18, color: C.inkSoft }}>Friday 30 October</div>
          </div>
          {frame >= QR_LAND - 2 ? (
            <div style={{ position: "absolute", right: 22, bottom: 22, transform: `scale(${2.2 - qr * 1.2}) rotate(${(1 - qr) * -20 + 3}deg)`, opacity: Math.min(1, qr * 2), transformOrigin: "50% 50%" }}>
              <div style={{ padding: 8, background: C.white, border: `3px solid ${C.ink}`, boxShadow: shadow(4) }}>
                <QrCode text="Comimo photo album: Basbousa and Candlelight, Friday 30 October" size={150} />
              </div>
            </div>
          ) : null}
          <div style={{ position: "absolute", right: 200, bottom: 120, opacity: qrLabel, transform: `translateX(${(1 - qrLabel) * 20}px)` }}>
            <Chip tone="highlight">Scan for the album →</Chip>
          </div>
        </div>
      ) : null}

      {/* Photos flying into the page as small thumbnails */}
      {frame >= TO_PAGE && frame < QR_LAND + 4
        ? PHOTOS.map((p, i) => {
            const t = progress(frame, TO_PAGE + i * 4, 26, inkEase);
            const x = map(t, [0, 1], [p.x, page.x + page.w - 120]);
            const y = map(t, [0, 1], [p.y, page.y + page.h - 140]);
            return (
              <div key={p.src} style={{ position: "absolute", left: x, top: y, transform: `rotate(${p.r * (1 - t)}deg) scale(${1 - t * 0.85})`, transformOrigin: "0 0", opacity: 1 - map(t, [0.85, 1], [0, 1]) }}>
                <Polaroid src={p.src} size={230} />
              </div>
            );
          })
        : null}

      <Cursor appear={10} hideAt={TO_PAGE - 10} keys={[{ f: 10, x: 700, y: 760 }, { f: ADD_CLICK, x: 160, y: 276, click: true }, { f: ADD_CLICK + 30, x: 480, y: 820 }]} />
    </div>
  );
}

/** 5. Real photos join the day; a QR code on the last page opens the album. */
export function Photos() {
  const { vertical } = useLayout();
  return (
    <AbsoluteFill>
      <Paper />
      <Camera keys={[{ f: 0, scale: 1.02 }, { f: TO_PAGE, scale: 1.0 }, { f: QR_LAND, scale: 1.04, x: vertical ? -10 : -12, y: vertical ? -40 : -24 }, { f: PHOTOS_DURATION, scale: 1.05, x: vertical ? -14 : -16, y: vertical ? -50 : -30 }]}>
        <StepFrame
          title={<StepTitle step={4} kicker="Optional" title="Add real photos" sub="They stay in an album with the day. A QR code on the last page opens it." size={vertical ? 92 : 84} width={vertical ? 900 : 640} />}
          ui={(box) => (
            <Fit w={900} h={900} box={box}>
              <PhotosUI />
            </Fit>
          )}
        />
      </Camera>
      <Sfx at={ADD_CLICK} name="click" />
      {DROPS.map((d) => (
        <Sfx key={d} at={d - 4} name="shutter" volume={0.35} />
      ))}
      {DROPS.map((d) => (
        <Sfx key={`t${d}`} at={d + 10} name="thud" volume={0.45} />
      ))}
      <Sfx at={TO_PAGE} name="whoosh" volume={0.4} />
      <Sfx at={QR_LAND} name="thud" volume={0.7} />
      <Sfx at={QR_LAND + 2} name="pop" volume={0.4} />
    </AbsoluteFill>
  );
}
