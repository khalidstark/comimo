/**
 * Scene lengths, transitions and English captions: plain data, so the render
 * script can also read it (Node strips the types) to write the WebVTT file.
 * Frames are at 30 fps. Each scene overlaps the next by OVERLAP frames while
 * its page turns or its panel wipes away.
 */
export const FPS = 30;
export const OVERLAP = 18;

export type SceneId = "Hook" | "Record" | "Storyteller" | "NewFaces" | "Photos" | "PageBuild" | "CheckIn" | "Finale";

export interface SceneTiming {
  id: SceneId;
  duration: number;
  out: "turn" | "wipe" | "none";
  /** Captions inside the scene, in scene frames. */
  captions: { from: number; to: number; text: string }[];
}

export const SCENES: SceneTiming[] = [
  { id: "Hook", duration: 150, out: "turn", captions: [{ from: 10, to: 150, text: "Talk about your day. Get a comic." }] },
  {
    id: "Record",
    duration: 268,
    out: "wipe",
    captions: [
      { from: 6, to: 120, text: "Step 1: press the box and add your script (or record a voice note)." },
      { from: 120, to: 268, text: "Comimo spots the people in it: three from the cast, two new names." },
    ],
  },
  { id: "Storyteller", duration: 180, out: "turn", captions: [{ from: 4, to: 180, text: "Step 2: Muse Spark retells the day as a chapter, shot by shot." }] },
  {
    id: "NewFaces",
    duration: 470,
    out: "wipe",
    captions: [
      { from: 4, to: 70, text: "Step 3: new faces. Omar isn't in the cast yet: add him from a photo." },
      { from: 70, to: 220, text: "SAM 3.1 cuts him out of the photo and Muse Spark writes how he looks." },
      { from: 220, to: 350, text: "Muse Image draws his reference sheet, and his sprite waves hello." },
      { from: 350, to: 470, text: "The cashier is only a small part: keep them as a one-off." },
    ],
  },
  {
    id: "Photos",
    duration: 230,
    out: "turn",
    captions: [
      { from: 4, to: 112, text: "Step 4: add real photos from the day, if you like." },
      { from: 112, to: 230, text: "A QR code on the last page opens the album." },
    ],
  },
  {
    id: "PageBuild",
    duration: 372,
    out: "wipe",
    captions: [
      { from: 4, to: 150, text: "Step 5: the page is drawn and lettered in a manga layout." },
      { from: 150, to: 282, text: "SAM 3.1 checks every face against the cast's sheets; Nour drifted, so she is redrawn." },
      { from: 282, to: 372, text: "Same faces in every panel." },
    ],
  },
  { id: "CheckIn", duration: 222, out: "turn", captions: [{ from: 4, to: 222, text: "Step 6: on heavy days, a gentle check-in card. No scores, no advice." }] },
  {
    id: "Finale",
    duration: 460,
    out: "none",
    captions: [
      { from: 4, to: 292, text: "One comic a day, all month long." },
      { from: 292, to: 372, text: "On the last day, the month is bound into a magazine." },
      { from: 372, to: 460, text: "Comimo. Talk about your day. Get a comic." },
    ],
  },
];

/** Start frame of each scene in the full walkthrough. */
export function sceneStarts(): number[] {
  const starts: number[] = [];
  let at = 0;
  for (const scene of SCENES) {
    starts.push(at);
    at += scene.duration - (scene.out === "none" ? 0 : OVERLAP);
  }
  return starts;
}

export function totalFrames(): number {
  const starts = sceneStarts();
  const last = SCENES.length - 1;
  return starts[last] + SCENES[last].duration;
}
