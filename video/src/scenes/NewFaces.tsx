import type { ReactNode } from "react";
import { AbsoluteFill, Img, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Button, Camera, Card, Chip, Cursor, Fit, Paper, Sfx, StepFrame, StepTitle, useLayout } from "../components/core";
import { OmarAvatar, OmarSprite, type OmarPose } from "../components/OmarSprite";
import { C, F, shadow } from "../theme";
import { inkEase, map, pop, progress, settle, typed } from "../lib/anim";
import { OMAR_LOOK } from "../story";

/* Timeline (frames) */
const ADD_CLICK = 42;
const TO_FORM = 52;
const PHOTO_DROP = 72;
const SAM_SCAN = 100;
const SAM_FOUND = 128;
const CUT_OUT = 140;
const LOOK_START = 156;
const SHEET_START = 222;
const SPRITE_IN = 276;
const BACK_TO_LIST = 350;
const ONE_OFF_CLICK = 384;
export const NEW_FACES_DURATION = 470;

const ROW_TOP = { omar: 196, cashier: 400 };

function Mystery({ size }: { size: number }) {
  return (
    <div style={{ width: size, height: size, borderRadius: 999, background: C.paperDeep, border: `3px dashed ${C.inkSoft}`, display: "grid", placeItems: "center", fontFamily: F.display, fontWeight: 800, fontSize: size * 0.45, color: C.inkSoft, boxSizing: "border-box" }}>?</div>
  );
}

function Row({ top, avatar, name, note, actions }: { top: number; avatar: ReactNode; name: string; note: string; actions: ReactNode }) {
  return (
    <div style={{ position: "absolute", left: 46, top, width: 808, height: 176, boxSizing: "border-box", background: C.paper, border: `2.5px solid ${C.ink}`, borderRadius: "4px 7px 5px 6px" }}>
      <div style={{ position: "absolute", left: 22, top: 30 }}>{avatar}</div>
      <div style={{ position: "absolute", left: 158, top: 16, fontFamily: F.display, fontWeight: 800, fontSize: 40, color: C.ink }}>{name}</div>
      <div style={{ position: "absolute", left: 158, top: 66, fontFamily: F.body, fontSize: 22, color: C.inkSoft }}>{note}</div>
      <div style={{ position: "absolute", left: 158, top: 104, display: "flex", gap: 18, alignItems: "center" }}>{actions}</div>
    </div>
  );
}

/** The "New faces in this story" list, before and after the choices. */
function ListView({ frame }: { frame: number }) {
  const { fps } = useVideoConfig();
  const added = frame >= BACK_TO_LIST;
  const stamp = pop(frame, ONE_OFF_CLICK + 4, fps, 320, 12);
  const foot = progress(frame, ONE_OFF_CLICK + 22, 16);
  return (
    <>
      <div style={{ position: "absolute", left: 46, top: 40 }}>
        <div style={{ fontFamily: F.display, fontWeight: 800, fontSize: 54, lineHeight: 1, color: C.ink }}>New faces in this story</div>
        <div style={{ marginTop: 12, fontFamily: F.body, fontSize: 24, color: C.inkSoft, width: 780 }}>Two names aren&apos;t in your cast yet. Add them once, or keep them for today only.</div>
      </div>
      <Row
        top={ROW_TOP.omar}
        avatar={added ? <div style={{ border: `3px solid ${C.ink}`, borderRadius: 999 }}><OmarAvatar size={110} /></div> : <Mystery size={116} />}
        name="Omar"
        note="With Karim at the bakery"
        actions={
          added ? (
            <Chip tone="calm" style={{ fontSize: 24, padding: "8px 16px" }}>✓ In your cast · drawn the same every time</Chip>
          ) : (
            <>
              <Button pressedAt={ADD_CLICK}>Add to cast</Button>
              <Button tone="ghost">Keep as a one-off</Button>
            </>
          )
        }
      />
      <Row
        top={ROW_TOP.cashier}
        avatar={<Mystery size={116} />}
        name="the cashier"
        note="A small part at the bakery"
        actions={
          frame < ONE_OFF_CLICK + 4 ? (
            <>
              <Button>Add to cast</Button>
              <Button tone="ghost" pressedAt={ONE_OFF_CLICK}>Keep as a one-off</Button>
            </>
          ) : (
            <div
              style={{
                transform: `scale(${2 - stamp}) rotate(-4deg)`,
                opacity: Math.min(1, stamp * 1.4),
                padding: "8px 18px",
                border: `4px solid ${C.accentText}`,
                borderRadius: 10,
                color: C.accentText,
                fontFamily: F.display,
                fontWeight: 800,
                fontSize: 30,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                background: "rgba(242,57,122,0.08)",
              }}
            >
              One-off · this story only
            </div>
          )
        }
      />
      <div style={{ position: "absolute", left: 46, top: 620, width: 808, opacity: foot, transform: `translateY(${(1 - foot) * 12}px)`, fontFamily: F.body, fontSize: 26, lineHeight: 1.45, color: C.inkSoft }}>
        The cashier is drawn as a background figure today and never asked about again. Omar now appears looking like himself in every comic.
      </div>
    </>
  );
}

/** "Meet Omar": photo → SAM cut-out → look text → sheet → sprite. */
function MeetView({ frame }: { frame: number }) {
  const { fps } = useVideoConfig();
  const drop = settle(frame, PHOTO_DROP, fps);
  const scan = progress(frame, SAM_SCAN, 26, inkEase);
  const scanning = frame >= SAM_SCAN && frame < SAM_SCAN + 30;
  const maskGlow = map(frame, [SAM_SCAN + 8, SAM_FOUND, CUT_OUT + 6], [0, 0.55, 0]);
  const cut = progress(frame, CUT_OUT, 18);
  const lift = pop(frame, CUT_OUT, fps, 160, 12);
  const found = pop(frame, SAM_FOUND, fps);
  const lookChip = pop(frame, LOOK_START - 6, fps);
  const sheetWipe = progress(frame, SHEET_START, 36, inkEase);
  const sheetChip = pop(frame, SHEET_START + 30, fps);
  const sprite = pop(frame, SPRITE_IN, fps, 170, 11);
  const s = frame - (SPRITE_IN + 14);
  const pose: OmarPose = s < 0 ? 0 : s < 52 ? (Math.floor(s / 7) % 2 === 0 ? 2 : 0) : s % 40 < 4 ? 1 : 0;

  // Photo box: 340 x 425 at (46, 140)
  const photo = { x: 46, y: 140, w: 330, h: 412 };
  return (
    <>
      <div style={{ position: "absolute", left: 46, top: 38, display: "flex", alignItems: "center", gap: 16 }}>
        <span style={{ fontFamily: F.display, fontWeight: 800, fontSize: 54, lineHeight: 1, color: C.ink }}>Meet Omar</span>
        <Chip tone="paper">Friend</Chip>
      </div>
      <div style={{ position: "absolute", left: 46, top: 100, fontFamily: F.display, fontWeight: 700, fontSize: 22, color: C.inkSoft }}>Start from a photo</div>

      {/* Drop zone and photo */}
      <div style={{ position: "absolute", left: photo.x, top: photo.y, width: photo.w, height: photo.h, border: `3px dashed ${C.inkSoft}`, borderRadius: 12, boxSizing: "border-box", background: C.paper }} />
      <div
        style={{
          position: "absolute",
          left: photo.x,
          top: photo.y,
          width: photo.w,
          height: photo.h,
          transform: `translateY(${(1 - drop) * -520}px) rotate(${(1 - drop) * 14 - 2}deg)`,
          opacity: frame >= PHOTO_DROP - 2 ? 1 : 0,
        }}
      >
        {/* The photo itself fades back to paper once SAM has the person. */}
        <div style={{ position: "absolute", inset: 0, border: `3px solid ${C.ink}`, borderRadius: 8, overflow: "hidden", background: C.white, boxShadow: shadow(5) }}>
          <Img src={staticFile("own/omar/photo.webp")} style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 1 - cut * 0.92, filter: `saturate(${1 - cut})` }} />
          {/* SAM's mask, tinted pink while it is found */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: C.accent,
              opacity: maskGlow,
              WebkitMaskImage: `url(${staticFile("own/omar/mask.png")})`,
              WebkitMaskSize: "cover",
              maskImage: `url(${staticFile("own/omar/mask.png")})`,
              maskSize: "cover",
            }}
          />
          {scanning ? (
            <div style={{ position: "absolute", left: 0, right: 0, top: `${scan * 100}%`, height: 6, background: C.calm, boxShadow: `0 0 24px 8px rgba(15,158,142,0.55)` }} />
          ) : null}
        </div>
        {/* The cut-out lifts off */}
        {frame >= CUT_OUT ? (
          <Img
            src={staticFile("own/omar/cutout.webp")}
            style={{
              position: "absolute",
              inset: 3,
              width: photo.w - 6,
              height: photo.h - 6,
              objectFit: "cover",
              transform: `translate(${-lift * 10}px, ${-lift * 14}px) scale(${1 + lift * 0.05})`,
              filter: `drop-shadow(8px 10px 0 rgba(27,33,72,${0.35 * lift}))`,
            }}
          />
        ) : null}
      </div>
      {frame >= SAM_FOUND ? (
        <div style={{ position: "absolute", left: 60, top: photo.y + photo.h + 18, transform: `scale(${found})`, transformOrigin: "0 50%" }}>
          <Chip tone="calm">SAM 3.1 found the person</Chip>
        </div>
      ) : null}

      {/* Look text */}
      <div style={{ position: "absolute", left: 412, top: 140, width: 442 }}>
        <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: 24, color: C.ink }}>How they look</div>
        <div style={{ marginTop: 8, minHeight: 178, padding: "12px 16px", boxSizing: "border-box", background: frame >= LOOK_START ? C.white : C.paper, border: `3px solid ${C.ink}`, borderRadius: 12, fontFamily: F.body, fontSize: 21, lineHeight: 1.45, color: C.ink }}>
          {typed(OMAR_LOOK, frame, LOOK_START, 3)}
        </div>
        {frame >= LOOK_START - 6 ? (
          <div style={{ marginTop: 10, transform: `scale(${lookChip})`, transformOrigin: "0 50%" }}>
            <Chip tone="calm" style={{ fontSize: 18 }}>Muse Spark wrote this from the photo</Chip>
          </div>
        ) : null}
      </div>

      {/* Reference sheet */}
      <div style={{ position: "absolute", left: 412, top: 424, width: 442, height: 266, border: `3px solid ${C.ink}`, borderRadius: 8, overflow: "hidden", background: C.paper, boxShadow: frame >= SHEET_START ? shadow(5) : "none" }}>
        <Img
          src={staticFile("own/omar/sheet.webp")}
          style={{ width: "100%", height: "100%", objectFit: "cover", clipPath: `polygon(0 0, ${sheetWipe * 140}% 0, ${sheetWipe * 140 - 40}% 100%, 0 100%)` }}
        />
        {frame < SHEET_START ? <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", fontFamily: F.body, fontSize: 22, color: C.inkSoft }}>Zine sheet</div> : null}
      </div>
      {frame >= SHEET_START + 30 ? (
        <div style={{ position: "absolute", left: 426, top: 704, transform: `scale(${sheetChip})`, transformOrigin: "0 50%" }}>
          <Chip tone="calm">Muse Image drew his sheet</Chip>
        </div>
      ) : null}

      {/* The sprite joins the cast */}
      {frame >= SPRITE_IN ? (
        <div style={{ position: "absolute", left: 0, right: 0, top: 590, height: 300 }}>
          <div style={{ position: "absolute", left: 120, bottom: 0, transform: `scale(${sprite})`, transformOrigin: "50% 100%" }}>
            <OmarSprite pose={pose} width={230} />
          </div>
          <div style={{ position: "absolute", left: 160, bottom: 2, width: 150, height: 18, borderRadius: "50%", background: "rgba(27,33,72,0.16)", transform: `scale(${sprite})` }} />
        </div>
      ) : null}
      {frame >= SPRITE_IN + 8 ? (
        <div style={{ position: "absolute", left: 412, top: 760, transform: `scale(${pop(frame, SPRITE_IN + 8, fps)})`, transformOrigin: "0 50%" }}>
          <div style={{ fontFamily: F.display, fontWeight: 800, fontSize: 40, color: C.ink, lineHeight: 1.05 }}>Omar joins your cast</div>
          <div style={{ marginTop: 8, fontFamily: F.body, fontSize: 22, color: C.inkSoft }}>The photo is never kept.</div>
        </div>
      ) : null}
    </>
  );
}

function NewFacesUI() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const cardIn = settle(frame, 0, fps);
  // The card's content slides like a page: list → form → list.
  const toForm = progress(frame, TO_FORM, 16, inkEase);
  const back = progress(frame, BACK_TO_LIST, 16, inkEase);
  const showForm = frame >= TO_FORM && frame < BACK_TO_LIST + 16;
  const showList = frame < TO_FORM + 16 || frame >= BACK_TO_LIST;
  const listX = frame < BACK_TO_LIST ? -toForm * 900 : (back - 1) * 900;
  const formX = frame < BACK_TO_LIST ? (1 - toForm) * 900 : -back * 900;
  return (
    <div style={{ position: "absolute", inset: 0, transform: `translateY(${(1 - cardIn) * 110}px)`, opacity: Math.min(1, cardIn * 1.5) }}>
      <Card style={{ left: 0, top: 0, width: 900, height: 900, overflow: "hidden" }}>
        {showList ? (
          <div style={{ position: "absolute", inset: 0, transform: `translateX(${listX}px)` }}>
            <ListView frame={frame} />
          </div>
        ) : null}
        {showForm ? (
          <div style={{ position: "absolute", inset: 0, transform: `translateX(${formX}px)` }}>
            <MeetView frame={frame} />
          </div>
        ) : null}
      </Card>
      <Cursor
        appear={16}
        hideAt={BACK_TO_LIST - 90}
        keys={[
          { f: 16, x: 640, y: 760 },
          { f: ADD_CLICK, x: 300, y: ROW_TOP.omar + 134, click: true },
          { f: ADD_CLICK + 30, x: 420, y: 700 },
        ]}
      />
      <Cursor
        appear={BACK_TO_LIST + 4}
        keys={[
          { f: BACK_TO_LIST + 4, x: 760, y: 820 },
          { f: ONE_OFF_CLICK, x: 560, y: ROW_TOP.cashier + 134, click: true },
          { f: ONE_OFF_CLICK + 30, x: 700, y: 760 },
        ]}
      />
    </div>
  );
}

/** 4. New faces: Omar is added from a photo; the cashier stays a one-off. */
export function NewFaces() {
  const { vertical } = useLayout();
  return (
    <AbsoluteFill>
      <Paper />
      <Camera keys={[{ f: 0, scale: 1.04 }, { f: PHOTO_DROP, scale: 1.0 }, { f: SPRITE_IN, scale: 1.05, y: vertical ? -30 : -20 }, { f: BACK_TO_LIST, scale: 1.0 }, { f: NEW_FACES_DURATION, scale: 1.03 }]}>
        <StepFrame
          title={<StepTitle step={3} kicker="Before anything is drawn" title="New faces in this story" sub="Add someone to your cast from one photo, or keep them as a one-off for today." size={vertical ? 92 : 84} width={vertical ? 900 : 640} />}
          ui={(box) => (
            <Fit w={900} h={900} box={box}>
              <NewFacesUI />
            </Fit>
          )}
        />
      </Camera>
      <Sfx at={ADD_CLICK} name="click" />
      <Sfx at={TO_FORM} name="whoosh-short" volume={0.4} />
      <Sfx at={PHOTO_DROP - 6} name="shutter" volume={0.5} />
      <Sfx at={PHOTO_DROP + 8} name="thud" volume={0.55} />
      <Sfx at={SAM_SCAN} name="whoosh" volume={0.3} />
      <Sfx at={CUT_OUT} name="pop" volume={0.5} />
      <Sfx at={LOOK_START} name="tick1" volume={0.3} />
      <Sfx at={LOOK_START + 12} name="tick3" volume={0.3} />
      <Sfx at={LOOK_START + 24} name="tick2" volume={0.3} />
      <Sfx at={SHEET_START} name="scratch" volume={0.5} />
      <Sfx at={SPRITE_IN} name="sparkle" volume={0.45} />
      <Sfx at={BACK_TO_LIST} name="whoosh-short" volume={0.4} />
      <Sfx at={ONE_OFF_CLICK} name="click" />
      <Sfx at={ONE_OFF_CLICK + 6} name="thud" volume={0.6} />
    </AbsoluteFill>
  );
}
