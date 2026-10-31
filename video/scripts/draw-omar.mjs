#!/usr/bin/env node
/**
 * One-off art for the walkthrough's "new faces" scene, drawn with Meta's
 * models from an invented photo of Omar (itself drawn by Muse Image in 03-05):
 *
 *   1. SAM 3.1 finds the person in the photo; its mask becomes the cut-out
 *      the video shows being lifted off the photo.            ($0.0025)
 *   2. Muse Image draws Omar's zine reference sheet from the photo. ($0.01)
 *   3. Four sprite poses from the sheet: idle, blink, two wave frames,
 *      on flat magenta that is keyed out here.                 ($0.04)
 *   4. One panel for the walkthrough's story: Karim and Omar at the bakery
 *      counter while the cashier hands over the basbousa.      ($0.01)
 *
 * Raw answers are cached in --work by job name, so a rerun only pays for
 * what is missing. The key is read from MODEL_API_KEY and only ever sent to
 * api.meta.ai:
 *
 *   node --env-file=../.env.local scripts/draw-omar.mjs --photo omar.jpg --work /tmp/omar
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { decodeMaskToRaster, parseImageStream, recordsOfKind } from "@meta-sam/parser";

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const HERE = path.dirname(new URL(import.meta.url).pathname);
const VIDEO = path.resolve(HERE, "..");
const SITE_PUBLIC = path.resolve(VIDEO, "../public");
const OUT = path.join(VIDEO, "public/own/omar");
const PHOTO = arg("photo");
const WORK = arg("work");
if (!PHOTO || !WORK) throw new Error("usage: draw-omar.mjs --photo <file> --work <dir>");
if (!process.env.MODEL_API_KEY) throw new Error("MODEL_API_KEY is not set");
mkdirSync(WORK, { recursive: true });
mkdirSync(OUT, { recursive: true });

const API = "https://api.meta.ai/v1";
let spent = 0;

async function call(route, body, price) {
  const response = await fetch(`${API}${route}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.MODEL_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(180_000),
  });
  spent += price;
  if (!response.ok) throw new Error(`${route} ${response.status}: ${(await response.text()).slice(0, 300)}`);
  return response.json();
}

const dataUrl = (buffer, type = "image/webp") => `data:${type};base64,${buffer.toString("base64")}`;

/** A cached Muse Image job: the raw webp is kept in WORK under its name. */
async function image(name, route, body) {
  const file = path.join(WORK, `${name}.webp`);
  if (existsSync(file)) return readFileSync(file);
  const json = await call(
    route,
    {
      model: "muse-image-1.0",
      n: 1,
      output_format: "webp",
      tool_enablement: { enable_image_search: false, enable_web_search: false, enable_shell: false },
      ...body,
    },
    0.01,
  );
  const b64 = json.data?.[0]?.b64_json;
  if (!b64) throw new Error(`${name}: no image in the answer`);
  const buffer = Buffer.from(b64, "base64");
  writeFileSync(file, buffer);
  console.log(`${name}: ${buffer.length} bytes`);
  return buffer;
}

/* ---------- 1. SAM cut-out of the photo ---------- */

const photo = await sharp(PHOTO).resize({ width: 900, height: 1200, fit: "inside" }).webp({ quality: 86 }).toBuffer({ resolveWithObject: true });
writeFileSync(path.join(OUT, "photo.webp"), photo.data);
const { width: PW, height: PH } = photo.info;

const samFile = path.join(WORK, "sam-person.txt");
if (!existsSync(samFile)) {
  const json = await call(
    "/responses",
    {
      model: "sam-3.1",
      store: false,
      metadata: { mask_encoding: "one_bit", include_confidence: "true" },
      input: [
        {
          type: "message",
          role: "user",
          content: [
            { type: "input_text", text: "person" },
            { type: "input_image", image_url: dataUrl(photo.data) },
          ],
        },
      ],
    },
    0.0025,
  );
  const text = json.output_text ?? (json.output ?? []).flatMap((o) => o.content ?? []).map((c) => c.text ?? "").join("");
  writeFileSync(samFile, text);
}

async function* replay(text) {
  const lane = { item_id: "sam", output_index: 0, content_index: 0 };
  yield { type: "response.output_text.delta", delta: text, ...lane };
  yield { type: "response.output_text.done", text, ...lane };
  yield { type: "response.completed" };
}
const parsed = await parseImageStream(replay(readFileSync(samFile, "utf8"))).finalResult;
const masks = recordsOfKind(parsed.records, "mask");
if (!masks.length) throw new Error("SAM found no person mask");
const best = masks.reduce((a, b) => ((b.bounds.right - b.bounds.left) * (b.bounds.bottom - b.bounds.top) > (a.bounds.right - a.bounds.left) * (a.bounds.bottom - a.bounds.top) ? b : a));
const raster = decodeMaskToRaster(best.mask);
const { left, top, right, bottom } = best.bounds;
const alpha = Buffer.alloc(PW * PH, 0);
for (let y = top; y < bottom && y < PH; y++) {
  for (let x = left; x < right && x < PW; x++) {
    const mx = Math.floor(((x - left) / (right - left)) * best.mask.width);
    const my = Math.floor(((y - top) / (bottom - top)) * best.mask.height);
    if (raster[my * best.mask.width + mx]) alpha[y * PW + x] = 255;
  }
}
const softAlpha = await sharp(alpha, { raw: { width: PW, height: PH, channels: 1 } }).blur(1.2).extractChannel(0).raw().toBuffer();
// The mask as alpha (for CSS mask-image): white where SAM found him.
const maskRgba = Buffer.alloc(PW * PH * 4, 255);
for (let i = 0; i < PW * PH; i++) maskRgba[i * 4 + 3] = softAlpha[i];
await sharp(maskRgba, { raw: { width: PW, height: PH, channels: 4 } }).png().toFile(path.join(OUT, "mask.png"));
const rgb = await sharp(photo.data).removeAlpha().raw().toBuffer();
const rgba = Buffer.alloc(PW * PH * 4);
for (let i = 0; i < PW * PH; i++) {
  rgba[i * 4] = rgb[i * 3];
  rgba[i * 4 + 1] = rgb[i * 3 + 1];
  rgba[i * 4 + 2] = rgb[i * 3 + 2];
  rgba[i * 4 + 3] = softAlpha[i];
}
await sharp(rgba, { raw: { width: PW, height: PH, channels: 4 } }).webp({ quality: 88, alphaQuality: 90 }).toFile(path.join(OUT, "cutout.webp"));
console.log(`SAM: person mask ${right - left}x${bottom - top} at ${left},${top} (confidence ${best.confidence ?? "?"})`);

/* ---------- 2. Reference sheet from the photo ---------- */

const LOOK =
  "Adult man with short curly dark hair. He wears thin round glasses and has a short beard and moustache. He wears a white T-shirt under a light-blue denim jacket with a brown crossbody bag strap.";
const ZINE =
  "Art style: a hand-printed risograph zine comic. Bold deep navy ink outlines (#1b2148) with a slightly uneven brush line. Flat riso colours with no gradients: deep navy #1b2148, riso pink #f2397a, sunflower yellow #ffc738 and teal #0f9e8e; other colours are tints or overprints of these inks. Light halftone dot shading in the shadows, simple rounded shapes, warm expressive faces.";
const NO_TEXT = "No text anywhere: no letters, words, numbers, signs, labels, logos, captions or speech bubbles.";

const sheet = await image("sheet", "/images/edits", {
  size: "1536x1024",
  images: [{ image_url: dataUrl(photo.data) }],
  prompt: [
    "Character reference sheet for an original comic character named Omar.",
    "Reference image 1 is a photo of the person he is based on. Keep what makes him recognisable (curly hair, face shape, round glasses, short beard, clothes and their colours) but draw him in the art style below, not as a photo. Ignore the photo's background, light and crop.",
    `Look: ${LOOK}`,
    "The same character twice, side by side at the same size: a front view on the left and a turned three-quarter view on the right, full body head to feet, relaxed neutral pose, calm friendly expression.",
    "Plain flat light newsprint background #eceff2 with nothing else on it.",
    ZINE,
    NO_TEXT,
  ].join("\n"),
});
await sharp(sheet).resize({ width: 1400, withoutEnlargement: true }).webp({ quality: 86 }).toFile(path.join(OUT, "sheet.webp"));

/* ---------- 3. Sprite poses on magenta ---------- */

const KEY = "Background: one perfectly flat, solid, pure magenta (#FF00FF) colour filling the whole image edge to edge like a chroma-key screen: no floor, no shadow, no gradient, no texture, no border. Never use magenta on the character.";
const KEEP = "Change nothing else: identical character, pose, position, size, framing, colours, line work and background.";

const idle = await image("idle", "/images/edits", {
  size: "1000x1200",
  images: [{ image_url: dataUrl(sheet) }],
  prompt: [
    "A single character sprite of Omar (reference image 1) for an animated sticker: full body, standing relaxed and facing the viewer, turned very slightly, both arms down at his sides, eyes open, a friendly closed-mouth smile.",
    "Reference image 1 is his character sheet (front and three-quarter views). Draw him exactly as on the sheet; do not copy the sheet's layout.",
    `Look: ${LOOK}`,
    "Exactly one character, centred, the whole body visible with wide empty margins: he fills about 70% of the image height and nothing touches the edges. No props, scenery or floor.",
    ZINE.replace("Art style:", "Art style (cut-out sticker, no paper):"),
    KEY,
    NO_TEXT,
  ].join("\n"),
});
const edit = (name, change, from) =>
  image(name, "/images/edits", {
    size: "1000x1200",
    reasoning_strength: "low",
    images: [{ image_url: dataUrl(from) }],
    prompt: [`Edit this image: ${change}`, KEEP, KEY, NO_TEXT].join("\n"),
  });
const [blink, wave1] = await Promise.all([
  edit("blink", "close the character's eyes in a relaxed blink, drawn as two soft curved lines.", idle),
  edit("wave1", "the character raises one hand up beside his head with an open palm, waving hello; feet, legs, body and the other arm stay exactly where they are.", idle),
]);
const wave2 = await edit("wave2", "tilt the raised waving hand the other way at the wrist, mid-wave, as the next moment of the same wave.", wave1);

/** Flood-fills the magenta backdrop from the edges to transparency, un-mixing the key from soft edges. */
async function keyOut(buffer, width, height) {
  const { data } = await sharp(buffer).resize(width, height, { fit: "fill" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const n = width * height;
  const keyness = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
    // Magenta: red and blue high, green low.
    keyness[i] = Math.max(0, Math.min(r, b) - g) / 255;
  }
  const bg = new Uint8Array(n);
  const queue = [];
  const push = (i) => {
    if (!bg[i] && keyness[i] > 0.45) {
      bg[i] = 1;
      queue.push(i);
    }
  };
  for (let x = 0; x < width; x++) {
    push(x);
    push((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    push(y * width);
    push(y * width + width - 1);
  }
  while (queue.length) {
    const i = queue.pop();
    const x = i % width, y = (i - x) / width;
    if (x > 0) push(i - 1);
    if (x < width - 1) push(i + 1);
    if (y > 0) push(i - width);
    if (y < height - 1) push(i + width);
  }
  for (let i = 0; i < n; i++) {
    if (bg[i]) {
      data[i * 4 + 3] = 0;
      continue;
    }
    const x = i % width, y = (i - x) / width;
    const nearBg = (x > 0 && bg[i - 1]) || (x < width - 1 && bg[i + 1]) || (y > 0 && bg[i - width]) || (y < height - 1 && bg[i + width]);
    if (nearBg && keyness[i] > 0.12) {
      const a = 1 - keyness[i];
      data[i * 4 + 3] = Math.round(255 * a);
      // Pull the magenta out of the edge colour.
      const g = data[i * 4 + 1];
      data[i * 4] = Math.min(data[i * 4], g + 40);
      data[i * 4 + 2] = Math.min(data[i * 4 + 2], g + 40);
    }
  }
  return data;
}

const meta = await sharp(idle).metadata();
const FW = 500;
const FH = Math.round((FW * meta.height) / meta.width);
const frames = [idle, blink, wave1, wave2];
const strip = Buffer.alloc(FW * frames.length * FH * 4);
for (const [index, frame] of frames.entries()) {
  const keyed = await keyOut(await sharp(frame).resize(meta.width, meta.height, { fit: "fill" }).toBuffer(), meta.width, meta.height);
  const small = await sharp(keyed, { raw: { width: meta.width, height: meta.height, channels: 4 } }).resize(FW, FH).raw().toBuffer();
  for (let y = 0; y < FH; y++) small.copy(strip, (y * FW * frames.length + index * FW) * 4, y * FW * 4, (y + 1) * FW * 4);
}
await sharp(strip, { raw: { width: FW * frames.length, height: FH, channels: 4 } }).webp({ quality: 88, alphaQuality: 92 }).toFile(path.join(OUT, "sprite.webp"));
writeFileSync(path.join(OUT, "sprite.json"), JSON.stringify({ frameWidth: FW, frameHeight: FH, frames: ["idle", "blink", "wave1", "wave2"] }, null, 2) + "\n");

/* ---------- 4. The bakery panel ---------- */

const karimSheet = readFileSync(path.join(SITE_PUBLIC, "art/cast/karim-sheet.webp"));
const panel = await image("bakery-panel", "/images/edits", {
  size: "1024x1024",
  images: [{ image_url: dataUrl(sheet) }, { image_url: dataUrl(karimSheet) }],
  prompt: [
    "One comic panel. Medium shot inside a small, warm neighbourhood bakery in the evening, glass counter full of trays of syrupy basbousa, a hanging lamp.",
    "Karim (reference image 2, his character sheet) stands at the counter on the right, holding out his hands for a cake box, smiling sheepishly. Omar (reference image 1, his character sheet) stands next to him on the left, laughing.",
    "Behind the counter, a cheerful middle-aged woman cashier in a teal apron and headscarf hands a tied white cake box across the counter. She is a background figure.",
    "Draw Karim and Omar exactly as on their sheets: same faces, hair, glasses, clothes and colours.",
    "Keep the top fifth of the picture calm and empty (plain wall) for a caption.",
    ZINE.replace("Art style:", "Art style, on cool newsprint off-white paper #eceff2:"),
    NO_TEXT,
  ].join("\n"),
});
await sharp(panel).resize({ width: 1200, withoutEnlargement: true }).webp({ quality: 84 }).toFile(path.join(OUT, "bakery-panel.webp"));

console.log(`Done. This run spent about $${spent.toFixed(4)}.`);
