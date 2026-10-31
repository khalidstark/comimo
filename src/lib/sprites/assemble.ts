import "server-only";
import sharp, { type Sharp } from "sharp";

/**
 * Turns five Muse Image poses of one character into an animated sprite sheet
 * for the cast cards: 6 columns x 4 rows (idle, blink, talk, wave), the same
 * layout as src/art/sprites.ts.
 *
 * Muse Image can't output transparency, so each pose is drawn on a flat
 * chroma colour and keyed out here: a flood fill from the image edges takes
 * the background, and edge pixels get partial alpha with the key colour
 * un-mixed, so nothing inside the drawing is keyed. Blink and talk paste only
 * the pixels that changed around the head back onto the idle pose, so the
 * body never jitters between frames; wave poses are lined up by the feet.
 *
 * Everything happens in memory; nothing is written to disk.
 */

/** Raw RGBA pixels. */
interface Rgba {
  data: Buffer;
  width: number;
  height: number;
}

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  w: number;
  h: number;
}

export interface SpritePoses {
  idle: Uint8Array;
  blink: Uint8Array;
  talk: Uint8Array;
  wave1: Uint8Array;
  wave2: Uint8Array;
}

export interface AssembledSprite {
  /** The 6 x 4 sheet, transparent WebP. */
  sheet: Uint8Array;
  /** The idle frame alone, transparent WebP. */
  portrait: Uint8Array;
  frameWidth: number;
  frameHeight: number;
  columns: number;
}

/** Poses are scaled to this height before keying: plenty for 360 px frames, and quick to process. */
const WORK_HEIGHT = 760;
const FRAME = { width: 300, height: 360 };
export const SPRITE_COLUMNS = 6;
const ROWS = 4;
/** Islands of opaque pixels smaller than this are specks, not drawing. */
const SPECK_PIXELS = 160;

const toSharp = (img: Rgba) => sharp(img.data, { raw: { width: img.width, height: img.height, channels: 4 } });

async function toRgba(pipeline: Sharp): Promise<Rgba> {
  const { data, info } = await pipeline.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

/** Decode a pose and scale it to the working height. */
function decode(bytes: Uint8Array): Promise<Rgba> {
  return toRgba(sharp(bytes).resize({ height: WORK_HEIGHT, withoutEnlargement: true }));
}

/** Cut the flat background out. The key colour is measured from the border, not assumed. */
export function keyOut(img: Rgba): Rgba {
  const { data, width: w, height: h } = img;
  const n = w * h;

  const border: number[][] = [];
  const at = (i: number) => [data[i * 4], data[i * 4 + 1], data[i * 4 + 2]];
  for (let x = 0; x < w; x += 2) border.push(at(x), at((h - 1) * w + x));
  for (let y = 0; y < h; y += 2) border.push(at(y * w), at(y * w + w - 1));
  const median = (k: number) => border.map((p) => p[k]).sort((a, b) => a - b)[border.length >> 1];
  const bg = [median(0), median(1), median(2)];

  const dist = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    dist[i] = Math.hypot(data[i * 4] - bg[0], data[i * 4 + 1] - bg[1], data[i * 4 + 2] - bg[2]);
  }

  // Flood from the edges through anything close to the key colour.
  const NEAR = 150;
  const CLEAR = 60;
  const isBg = new Uint8Array(n);
  const stack: number[] = [];
  const push = (i: number) => {
    if (!isBg[i] && dist[i] < NEAR) {
      isBg[i] = 1;
      stack.push(i);
    }
  };
  for (let x = 0; x < w; x++) {
    push(x);
    push((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    push(y * w);
    push(y * w + w - 1);
  }
  // Enclosed pockets of pure key colour (between an arm and the body).
  for (let i = 0; i < n; i++) if (dist[i] < 36) push(i);
  while (stack.length > 0) {
    const i = stack.pop()!;
    const x = i % w;
    if (x > 0) push(i - 1);
    if (x < w - 1) push(i + 1);
    if (i >= w) push(i - w);
    if (i < n - w) push(i + w);
  }

  const out = Buffer.alloc(n * 4);
  for (let i = 0; i < n; i++) {
    let r = data[i * 4];
    let g = data[i * 4 + 1];
    let b = data[i * 4 + 2];
    let a = 1;
    if (isBg[i]) {
      a = Math.min(1, Math.max(0, (dist[i] - CLEAR) / (NEAR - CLEAR)));
      if (a > 0) {
        // The pixel is a mix C = a*F + (1-a)*B; recover F.
        r = (r - (1 - a) * bg[0]) / a;
        g = (g - (1 - a) * bg[1]) / a;
        b = (b - (1 - a) * bg[2]) / a;
      }
    }
    out[i * 4] = Math.max(0, Math.min(255, r));
    out[i * 4 + 1] = Math.max(0, Math.min(255, g));
    out[i * 4 + 2] = Math.max(0, Math.min(255, b));
    out[i * 4 + 3] = Math.round(a * 255);
  }
  return { data: out, width: w, height: h };
}

/** Clear every opaque island smaller than `min` pixels. */
export function dropSpecks(img: Rgba, min = SPECK_PIXELS): Rgba {
  const { data, width: w, height: h } = img;
  const n = w * h;
  const seen = new Uint8Array(n);
  const island: number[] = [];
  for (let start = 0; start < n; start++) {
    if (seen[start] || data[start * 4 + 3] < 24) continue;
    island.length = 0;
    island.push(start);
    seen[start] = 1;
    for (let k = 0; k < island.length; k++) {
      const i = island[k];
      const x = i % w;
      const next = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w];
      for (const j of next) {
        if (j >= 0 && j < n && !seen[j] && data[j * 4 + 3] >= 24) {
          seen[j] = 1;
          island.push(j);
        }
      }
    }
    if (island.length < min) for (const i of island) data[i * 4 + 3] = 0;
  }
  return img;
}

/** The box around pixels more opaque than `threshold`, or null for an empty image. */
export function alphaBox({ data, width, height }: Rgba, threshold = 24): Box | null {
  let x0 = width;
  let y0 = height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > threshold) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return x1 < 0 ? null : { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** Paste what changed between `base` and `pose` in the top `region` of the figure (the head) onto `base`. */
function pasteHead(base: Rgba, pose: Rgba, box: Box, region: number): Rgba {
  const { width: w, height: h } = base;
  const limit = Math.min(h, box.y0 + Math.round(box.h * region));
  const changed = new Uint8Array(w * h);
  for (let y = 0; y < limit; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const d =
        Math.abs(base.data[i] - pose.data[i]) +
        Math.abs(base.data[i + 1] - pose.data[i + 1]) +
        Math.abs(base.data[i + 2] - pose.data[i + 2]) +
        Math.abs(base.data[i + 3] - pose.data[i + 3]);
      if (d > 90) changed[y * w + x] = 1;
    }
  }
  // Grow and soften the mask so pasted strokes keep their edges.
  const R = 5;
  const weight = new Float32Array(w * h);
  for (let y = 0; y < limit; y++) {
    for (let x = 0; x < w; x++) {
      if (!changed[y * w + x]) continue;
      for (let dy = -R; dy <= R; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -R; dx <= R; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          const v = 1 - Math.hypot(dx, dy) / (R + 1);
          if (v > weight[yy * w + xx]) weight[yy * w + xx] = v;
        }
      }
    }
  }
  const out = Buffer.from(base.data);
  for (let i = 0; i < w * h; i++) {
    const m = Math.min(1, weight[i] * 1.6);
    if (m <= 0) continue;
    for (let c = 0; c < 4; c++) out[i * 4 + c] = Math.round(base.data[i * 4 + c] * (1 - m) + pose.data[i * 4 + c] * m);
  }
  return { data: out, width: w, height: h };
}

/** Where the lower body stands: the mean x of the bottom 30% of the figure, and its lowest row. */
function footing(img: Rgba, box: Box): { x: number; bottom: number } {
  const from = box.y0 + Math.round(box.h * 0.7);
  let sum = 0;
  let count = 0;
  for (let y = from; y <= box.y1; y++) {
    for (let x = box.x0; x <= box.x1; x++) {
      if (img.data[(y * img.width + x) * 4 + 3] > 128) {
        sum += x;
        count++;
      }
    }
  }
  return { x: count > 0 ? sum / count : (box.x0 + box.x1) / 2, bottom: box.y1 };
}

/** Move a whole-body pose so its feet stand where the base's do. */
async function alignByFeet(base: Rgba, baseBox: Box, pose: Rgba): Promise<Rgba> {
  const poseBox = alphaBox(pose);
  if (!poseBox) return base;
  const a = footing(base, baseBox);
  const b = footing(pose, poseBox);
  const dx = Math.round(a.x - b.x);
  const dy = Math.round(a.bottom - b.bottom);
  const left = Math.max(0, -dx);
  const top = Math.max(0, -dy);
  const width = Math.min(pose.width - left, base.width - Math.max(0, dx));
  const height = Math.min(pose.height - top, base.height - Math.max(0, dy));
  if (width <= 0 || height <= 0) return base;
  const piece = await toSharp(pose).extract({ left, top, width, height }).png().toBuffer();
  const canvas = sharp({ create: { width: base.width, height: base.height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } });
  return toRgba(canvas.composite([{ input: piece, left: Math.max(0, dx), top: Math.max(0, dy) }]));
}

/** A pose keyed and scaled to the base's size. */
async function keyedPose(bytes: Uint8Array, size: { width: number; height: number }): Promise<Rgba> {
  const keyed = dropSpecks(keyOut(await decode(bytes)));
  if (keyed.width === size.width && keyed.height === size.height) return keyed;
  return toRgba(toSharp(keyed).resize(size.width, size.height, { fit: "fill" }));
}

/** Thrown when the poses can't make a sheet (nothing left after keying). */
export class SpriteAssemblyError extends Error {
  name = "SpriteAssemblyError";
}

/**
 * Build the sheet. `headRegion` is how much of the figure, from the top, the
 * blink and talk changes may touch (about a third for people, half for a cat).
 */
export async function assembleSprite(poses: SpritePoses, headRegion: number): Promise<AssembledSprite> {
  const base = dropSpecks(keyOut(await decode(poses.idle)));
  const baseBox = alphaBox(base);
  if (!baseBox || baseBox.w < 20 || baseBox.h < 40) throw new SpriteAssemblyError("no figure on the idle pose");
  const size = { width: base.width, height: base.height };

  const blink = pasteHead(base, await keyedPose(poses.blink, size), baseBox, headRegion);
  const talk = pasteHead(base, await keyedPose(poses.talk, size), baseBox, headRegion);
  const wave1 = await alignByFeet(base, baseBox, await keyedPose(poses.wave1, size));
  const wave2 = await alignByFeet(base, baseBox, await keyedPose(poses.wave2, size));

  // One crop for every frame, so nothing jumps between rows.
  const boxes = [base, blink, talk, wave1, wave2].map((img) => alphaBox(img) ?? baseBox);
  const union = {
    x0: Math.min(...boxes.map((b) => b.x0)),
    y0: Math.min(...boxes.map((b) => b.y0)),
    x1: Math.max(...boxes.map((b) => b.x1)),
    y1: Math.max(...boxes.map((b) => b.y1)),
  };
  const unionW = union.x1 - union.x0 + 1;
  const unionH = union.y1 - union.y0 + 1;
  const { width: cellW, height: cellH } = FRAME;
  const scale = Math.min((cellW * 0.92) / unionW, (cellH * 0.94) / unionH);
  const drawW = Math.max(1, Math.round(unionW * scale));
  const drawH = Math.max(1, Math.round(unionH * scale));
  const offY = cellH - drawH - Math.round(cellH * 0.02);

  const frame = async (img: Rgba, breathe = 0) => {
    // Breathing: a slight stretch from the feet up.
    const h = Math.round(drawH * (1 + breathe));
    const w = Math.round(drawW * (1 - breathe * 0.5));
    const input = await toSharp(img)
      .extract({ left: union.x0, top: union.y0, width: unionW, height: unionH })
      .resize(w, h, { fit: "fill" })
      .png()
      .toBuffer();
    return { input, w, h };
  };

  const I = await frame(base);
  const B = await frame(blink);
  const T = await frame(talk);
  const W1 = await frame(wave1);
  const W2 = await frame(wave2);
  const breaths = await Promise.all([0, 0.006, 0.012, 0.016, 0.012, 0.006].map((k) => frame(base, k)));
  const rows = [breaths, [I, B, B, B, I, I], [I, T, T, I, T, I], [I, W1, W2, W1, W2, I]];

  const composites = rows.flatMap((row, r) =>
    row.map((f, c) => ({
      input: f.input,
      left: c * cellW + Math.round((cellW - f.w) / 2),
      top: Math.max(0, r * cellH + offY + (drawH - f.h)),
    })),
  );
  const transparent = { r: 0, g: 0, b: 0, alpha: 0 };
  const sheet = await sharp({ create: { width: cellW * SPRITE_COLUMNS, height: cellH * ROWS, channels: 4, background: transparent } })
    .composite(composites)
    .webp({ quality: 80, alphaQuality: 90 })
    .toBuffer();
  const portrait = await sharp({ create: { width: cellW, height: cellH, channels: 4, background: transparent } })
    .composite([{ input: I.input, left: Math.round((cellW - I.w) / 2), top: offY }])
    .webp({ quality: 88, alphaQuality: 100 })
    .toBuffer();

  return { sheet: new Uint8Array(sheet), portrait: new Uint8Array(portrait), frameWidth: cellW, frameHeight: cellH, columns: SPRITE_COLUMNS };
}
