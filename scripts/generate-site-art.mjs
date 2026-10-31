#!/usr/bin/env node
/**
 * Draws Comimo's own site art with Muse Image and turns it into the files the
 * art manifest serves from public/art/site:
 *
 *   - the hero (Nour recording a voice note at night, drawn from her sheet)
 *   - three "how it works" spots, three empty states, the month cover
 *   - the day-weather icons (one row, sliced)
 *   - animated sprite sheets for Mimo and the starter cast (6 x 4: idle,
 *     blink, talk, wave), the static portraits and the logo mark cut from them
 *   - one demo panel drawn WITHOUT the cast's sheets, the honest "before"
 *     for the home page's before/after flip
 *
 * Muse Image can't output transparency, so every cut-out is drawn on a flat
 * chroma colour and keyed here: a flood fill from the image edges takes the
 * background, edge pixels get partial alpha and are un-mixed from the key
 * colour, so nothing inside the drawing is ever keyed out.
 *
 * Sprite frames: one master pose per character (an edit of their reference
 * sheet), then small edits of that master (eyes closed, mouth open, hand up).
 * Blink and talk frames paste only the pixels that changed in the head area
 * back onto the master, so the body never jitters between frames.
 *
 *   set -a; . ./.env.local; set +a        # MODEL_API_KEY, never printed
 *   node scripts/generate-site-art.mjs [--work DIR] [--only a,b] [--redo a,b]
 *                                      [--max-images 60] [--process-only]
 *
 * Request shape matches src/lib/models/meta/image.ts (same model, base fields
 * and tool switches; edits take `images` as data URLs). Raw results are cached
 * in the work folder by job id, so a rerun only pays for what is missing.
 * A ledger there counts every returned image ($0.01 each) and the run stops
 * before it passes --max-images. sharp comes with Next.js; no extra install.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { ART_STYLES } from "../src/lib/artStyles.ts";

/* ---------- Arguments ---------- */

const args = process.argv.slice(2);
function flag(name, fallback) {
  const i = args.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const value = args[i + 1];
  return value && !value.startsWith("--") ? value : true;
}
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const WORK = path.resolve(String(flag("work", path.join(os.tmpdir(), "comimo-site-art"))));
const OUT = path.join(ROOT, "public/art/site");
const ONLY = flag("only", "") ? String(flag("only")).split(",") : null;
const REDO = new Set(flag("redo", "") ? String(flag("redo")).split(",") : []);
const MAX_IMAGES = Number(flag("max-images", 60));
const PROCESS_ONLY = Boolean(flag("process-only", false));
const PARALLEL = 6;

mkdirSync(path.join(WORK, "raw"), { recursive: true });
mkdirSync(OUT, { recursive: true });

/* ---------- Prompts ---------- */

const NO_TEXT =
  "No text anywhere in the image: no letters, words, numbers, signs, labels, logos, captions, speech bubbles or sound effects.";

const ZINE = ART_STYLES.zine.prompt;
/** The zine style without its paper, for art that is cut out and laid on the page. */
const ZINE_CUTOUT = ZINE.replace(" on cool newsprint off-white paper #eceff2", "").replace(" a little paper grain,", "");

const KEYS = {
  green: { name: "green", hex: "#00FF00" },
  magenta: { name: "magenta", hex: "#FF00FF" },
};

function backdrop(key) {
  const { name, hex } = KEYS[key];
  return `Background: one perfectly flat, solid, pure ${name} (${hex}) colour filling the whole image edge to edge, like a chroma-key screen: no floor, no ground shadow, no cast shadow, no gradient, no texture, no paper grain, no vignette, no frame or border. Never use this ${name} anywhere on the subject.`;
}

const SHEET_NOTE =
  "Each reference image is a character sheet showing one character from the front and from three-quarters. Draw each character exactly as on their sheet: same face, hair, glasses, clothes, colours and body shape. Do not copy the sheet's layout.";

const LOOK = {
  nour: "Woman in her early twenties, shoulder-length curly dark hair held up in a claw clip, round tortoiseshell glasses, mustard cardigan over a navy T-shirt, a canvas tote bag covered in enamel pins.",
  karim:
    "Tall, lanky young man with a short fade haircut and a thin moustache he is proud of, oversized olive bomber jacket, white trainers, usually holding a phone or a glass of tea.",
  teta: "Small, round grandmother with silver hair under a lilac headscarf, reading glasses on a beaded chain, a floral house dress and soft slippers.",
  mishmish: "Chubby orange tabby cat with a white chest, one bent ear and a very fluffy tail.",
  mimo: "Mimo, Comimo's mascot: a plump, round-cornered riso pink (#f2397a) speech bubble with a short pointed tail at its lower left, a thick deep navy outline, two big white oval eyes with navy pupils, rosy cheeks and a small happy mouth, two short navy stick legs with round navy shoes, and two short stubby navy stick arms with round hands. A small white shine on its upper left edge.",
};

const SHEET = {
  nour: "public/art/cast/nour-sheet.webp",
  karim: "public/art/cast/karim-sheet.webp",
  teta: "public/art/cast/teta-sheet.webp",
  mishmish: "public/art/cast/mishmish-sheet.webp",
};

/* ---------- Jobs ---------- */

/**
 * A job is one Muse Image request. `refs` are files (repo paths) or other
 * jobs' results (`job:<id>`), sent in order as reference images.
 */
const jobs = [];
const job = (spec) => jobs.push({ n: 1, refs: [], ...spec });

// Sprite characters: [id, chroma key, frame aspect "WxH", pose words]
const SPRITE_CAST = [
  ["mimo", "green", "1200x1080"],
  ["nour", "magenta", "1000x1200"],
  ["karim", "magenta", "1000x1200"],
  ["teta", "magenta", "1000x1200"],
  ["mishmish", "magenta", "1000x1200"],
];

const KEEP = "Change nothing else: identical character, pose, position, size, framing, colours, line work and background.";

for (const [id, key, size] of SPRITE_CAST) {
  const cat = id === "mishmish";
  const mimo = id === "mimo";
  const who = mimo ? "Mimo" : id === "teta" ? "Teta Samia" : id[0].toUpperCase() + id.slice(1);
  const pose = cat
    ? "sitting upright and facing the viewer, slightly turned, front paws together, tail curled around the paws, eyes open, mouth closed in a content little smile"
    : mimo
      ? "standing on its two legs and facing the viewer, arms relaxed down at its sides, eyes open, mouth closed in a happy smile"
      : "standing in a relaxed pose and facing the viewer, turned very slightly, both arms relaxed down at the sides, eyes open, mouth closed in a friendly smile";
  job({
    id: `${id}-idle`,
    kind: "sprite",
    endpoint: mimo ? "generations" : "edits",
    refs: mimo ? [] : [SHEET[id]],
    size,
    key,
    prompt: [
      `A single character sprite of ${who}${mimo ? "" : " (reference image 1)"} for an animated sticker, full body, ${pose}.`,
      mimo ? `Character: ${LOOK.mimo}` : `${SHEET_NOTE}\nLook: ${LOOK[id]}`,
      "Exactly one character, centred, the whole body visible with wide empty margins on every side: the character fills only about 70% of the image height and nothing touches the edges of the image. Nothing else in the picture: no props, no scenery, no floor.",
      ZINE_CUTOUT,
      backdrop(key),
      NO_TEXT,
    ].join("\n"),
  });
  const edit = (suffix, change, from = `${id}-idle`) =>
    job({
      id: `${id}-${suffix}`,
      kind: "sprite",
      endpoint: "edits",
      refs: [`job:${from}`],
      size,
      key,
      prompt: [`Edit this image: ${change}`, KEEP, backdrop(key), NO_TEXT].join("\n"),
    });
  edit("blink", "close the character's eyes in a relaxed blink, drawn as two soft curved lines.");
  edit("talk", cat ? "open the cat's mouth in a small happy meow." : "open the character's mouth wide as if cheerfully saying a word mid-sentence.");
  edit(
    "wave1",
    cat
      ? "the cat lifts one front paw up beside its face as if waving hello; the rest of its body stays sitting exactly where it is."
      : mimo
        ? "Mimo raises one stubby arm high above its side with the round hand open, waving hello; legs, body and the other arm stay exactly where they are."
        : "the character raises one hand up beside the head with an open palm, waving hello; feet, legs, body and the other arm stay exactly where they are.",
  );
  edit("wave2", "tilt the raised waving hand the other way at the wrist, mid-wave, as the next moment of the same wave.", `${id}-wave1`);
}

// One try at the whole Mimo sheet in a single image, kept for comparison with the pose-by-pose sheet.
job({
  id: "mimo-grid-trial",
  kind: "trial",
  endpoint: "edits",
  refs: ["job:mimo-idle"],
  size: "1800x1080",
  key: "green",
  prompt: [
    "A sprite sheet of the character in the reference image: an exact grid of 6 columns and 4 rows, 24 frames of identical size, the character the same size and position in every cell.",
    "Row 1: idle breathing, the body rising and falling slightly. Row 2: a blink, eyes open, closing, closed, opening. Row 3: talking, the mouth opening and closing. Row 4: waving one arm, raised and swinging.",
    "No grid lines, no cell borders.",
    ZINE_CUTOUT,
    backdrop("green"),
    NO_TEXT,
  ].join("\n"),
});

// Hero: Nour on her bed at night, her day floating out of the phone as comic panels.
job({
  id: "hero",
  kind: "plate",
  endpoint: "edits",
  refs: [SHEET.nour, SHEET.mishmish],
  size: "2048x1152",
  n: 2,
  prompt: [
    "A wide, cinematic illustration for the top of a website.",
    SHEET_NOTE,
    `Nour (reference image 1): ${LOOK.nour}`,
    `Mishmish (reference image 2): ${LOOK.mishmish}`,
    "Scene: night, Nour's small bedroom in Cairo. Nour sits cross-legged on her bed in the right third of the picture, lit warmly by a small bedside lamp and the soft glow of her phone. She holds the phone close to her mouth and talks into it, recording a voice note about her day, relaxed and smiling. Mishmish sleeps curled up at the foot of the bed.",
    "From the phone, a gentle ribbon of five or six small comic panels floats up and drifts toward the upper left like paper cards on a breeze, each smaller than the last. Each little panel is a tiny, wordless moment of her day with simple figures: a friend waving beside a car, a grandmother serving soup at a table, a cat curled on a chair, three people drinking tea on a balcony.",
    "The left half of the picture stays calm and uncluttered: a big window onto a deep navy night sky with a few stars and faraway rooftops, mostly empty, so a headline can sit on top of it.",
    "Mood: cosy, quiet, a little magical. Colour: deep navy dominates, warm sunflower lamp light, small riso pink and teal accents.",
    ZINE,
    NO_TEXT,
  ].join("\n"),
});

// How it works: three spots, cut out.
const spot = (id, refs, scene, key = "magenta") =>
  job({
    id,
    kind: "cutout",
    endpoint: "edits",
    refs,
    size: "1600x1200",
    key,
    prompt: [
      "A small spot illustration for a website, one simple vignette with no scenery around it.",
      SHEET_NOTE,
      scene,
      "Keep it simple and readable at a small size, centred with a clear margin on every side.",
      ZINE_CUTOUT,
      backdrop("magenta"),
      NO_TEXT,
    ].join("\n"),
  });

spot(
  "how-talk",
  [SHEET.nour],
  `Nour (reference image 1), from the waist up, holds her phone in front of her and talks into it with a lively hand gesture, three curved sound-wave arcs coming from the phone. The phone screen is a plain pale blue glow. Look: ${LOOK.nour}`,
  "green",
);
spot(
  "how-comic",
  [SHEET.nour, SHEET.karim],
  `A smartphone seen at an angle, with a short strip of four comic panels rising out of its screen like a paper ribbon, each panel a little larger than the one before. The panels show two friends, Nour (reference image 1) and Karim (reference image 2): Karim waving next to a small car, then the two of them laughing together at a dinner table. The panels have no words.`,
);
spot(
  "how-book",
  [SHEET.mishmish],
  `A thick stapled comic magazine lying open, its pages fanning as if being flipped, two more issues stacked under it, and Mishmish the cat (reference image 1) curled up asleep on top of the stack. The open pages show small colourful comic panels with simple figures and no words; the covers have no titles.`,
);

// Empty states: Mimo with what's missing.
const empty = (id, scene) =>
  job({
    id,
    kind: "cutout",
    endpoint: "edits",
    refs: ["job:mimo-idle"],
    size: "1600x1200",
    key: "green",
    prompt: [
      "A small spot illustration for an empty screen of a website, one simple vignette with no scenery around it.",
      `The character in the reference image is Mimo, the mascot. Draw Mimo exactly as in the reference: same shape, pink colour, eyes, arms and legs. ${scene}`,
      "Centred with a clear margin on every side.",
      ZINE_CUTOUT,
      backdrop("green"),
      NO_TEXT,
    ].join("\n"),
  });

empty("empty-cast", "Mimo holds a big pencil and stands beside a blank sketch card on an easel; the card shows only a dashed outline of a person waiting to be drawn.");
empty("empty-month", "Mimo peeks happily over the top of an open magazine whose pages are still blank white, waiting for the month's comics.");
empty("empty-days", "Mimo stands beside an empty comic page of blank panels, holding up a small microphone, ready to listen.");

// Day weather: five stickers in one row, sliced apart afterwards.
job({
  id: "moods",
  kind: "moods",
  endpoint: "generations",
  size: "2500x500",
  key: "magenta",
  prompt: [
    "Five separate weather stickers in a single row, evenly spaced, all the same size, with clear empty background between them. From left to right: 1) a round sun with short rays, 2) a soft pale grey cloud, 3) a blue rain cloud with a few raindrops, 4) a dark slate storm cloud with a sunflower yellow lightning bolt, 5) a rainbow arching over a small white cloud.",
    "Simple, bold, chunky shapes that read at a very small size, thick navy outlines, no faces.",
    ZINE_CUTOUT,
    backdrop("magenta"),
    NO_TEXT,
  ].join("\n"),
});

// The month magazine's cover art (the masthead and cover lines are HTML).
job({
  id: "month-cover",
  kind: "plate",
  endpoint: "edits",
  refs: [SHEET.nour, SHEET.mishmish],
  size: "1200x1500",
  prompt: [
    "A magazine cover illustration with no text.",
    SHEET_NOTE,
    `Nour (reference image 1): ${LOOK.nour}`,
    `Mishmish (reference image 2): ${LOOK.mishmish}`,
    "Nour sits on a small Cairo balcony at golden hour reading a comic magazine, smiling, with Mishmish asleep on her lap; potted plants and warm rooftops behind her.",
    "Keep the top quarter of the picture plain sky, and the bottom fifth simple (the balcony wall): a masthead and cover lines will sit there.",
    ZINE,
    NO_TEXT,
  ].join("\n"),
});

// The demo's honest "before": the Mishmish panel drawn from the same scene, without any reference sheet.
const BEFORE_SCENE =
  "Same dining room moments later. Mishmish is curled proudly on Karim's chair. Karim sits on the floor laughing loudly. Nour watches them giggling.";
for (const style of ["zine", "painterly"]) {
  job({
    id: `demo-before-${style}`,
    kind: "plate",
    endpoint: "generations",
    size: "1536x1024",
    prompt: [
      "One panel of a diary comic, drawn as a single scene.",
      "Characters:",
      `- Karim: ${LOOK.karim}`,
      `- Mishmish: ${LOOK.mishmish}`,
      `- Nour: ${LOOK.nour}`,
      "Left to right in the picture: Karim, then Mishmish, then Nour.",
      `Scene: ${BEFORE_SCENE}`,
      "Composition: a medium shot with the characters clearly readable.",
      `Leave the top third of the panel as plain, empty background (${ART_STYLES[style].emptyBand}) with no heads, faces or important details in it, painted as part of the same continuous scene (not a separate strip or border): captions and speech bubbles will cover that area later. Place the characters in the lower two thirds, heads fully inside the frame and below that empty band. No panel border.`,
      ART_STYLES[style].prompt,
      NO_TEXT,
    ].join("\n"),
  });
}

/* ---------- Ledger ---------- */

const ledgerFile = path.join(WORK, "ledger.json");
const ledger = existsSync(ledgerFile) ? JSON.parse(readFileSync(ledgerFile, "utf8")) : { images: 0, requests: [] };
const saveLedger = () => writeFileSync(ledgerFile, JSON.stringify(ledger, null, 1));

/* ---------- Muse Image ---------- */

const BASE_URL = "https://api.meta.ai/v1";

function apiKey() {
  const key = process.env.MODEL_API_KEY?.trim();
  if (!key) throw new Error("MODEL_API_KEY is not set in the environment.");
  return key;
}

const rawPath = (id, i = 0) => path.join(WORK, "raw", `${id}${i ? `-${i}` : ""}.webp`);

function dataUrl(file) {
  const bytes = readFileSync(file);
  const type = file.endsWith(".png") ? "image/png" : file.endsWith(".jpg") ? "image/jpeg" : "image/webp";
  return `data:${type};base64,${bytes.toString("base64")}`;
}

async function request(endpoint, body) {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(`${BASE_URL}/images/${endpoint}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey()}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(180_000),
    });
    if (response.ok) return response.json();
    let detail = `HTTP ${response.status}`;
    try {
      const error = (await response.json())?.error;
      if (error?.code) detail += ` ${error.code}`;
      if (typeof error?.message === "string") detail += `: ${error.message.slice(0, 200)}`;
    } catch {
      // keep the status
    }
    if (attempt < 1 && [429, 500, 502, 503, 504].includes(response.status)) {
      await new Promise((r) => setTimeout(r, 2000));
      continue;
    }
    throw new Error(detail);
  }
}

const done = new Map();

async function run(spec) {
  if (done.has(spec.id)) return done.get(spec.id);
  const promise = (async () => {
    const outputs = Array.from({ length: spec.n }, (_, i) => rawPath(spec.id, i));
    const cached = outputs.every((file) => existsSync(file));
    // Dependencies first (they may be cached even when this job is redone).
    const refs = [];
    for (const ref of spec.refs) {
      if (ref.startsWith("job:")) {
        const dep = jobs.find((j) => j.id === ref.slice(4));
        await run(dep);
        refs.push(rawPath(dep.id));
      } else {
        refs.push(path.join(ROOT, ref));
      }
    }
    if (cached && !REDO.has(spec.id)) return outputs;
    if (PROCESS_ONLY) throw new Error(`${spec.id}: not drawn yet`);
    if (ONLY && !ONLY.includes(spec.id) && !REDO.has(spec.id)) throw new Error(`${spec.id}: not drawn yet (skipped by --only)`);
    if (ledger.images + spec.n > MAX_IMAGES) throw new Error(`${spec.id}: would pass --max-images ${MAX_IMAGES} (${ledger.images} so far)`);

    const body = {
      model: "muse-image-1.0",
      n: spec.n,
      output_format: "webp",
      tool_enablement: { enable_image_search: false, enable_web_search: false, enable_shell: false },
      size: spec.size,
      prompt: spec.prompt,
      ...(spec.endpoint === "edits" ? { images: refs.map((file) => ({ image_url: dataUrl(file) })) } : {}),
    };
    const started = Date.now();
    ledger.images += spec.n; // reserve before sending so parallel jobs can't overshoot
    saveLedger();
    let result;
    try {
      result = await request(spec.endpoint, body);
    } catch (error) {
      ledger.images -= spec.n; // failed and filtered images are free
      saveLedger();
      throw new Error(`${spec.id}: ${error.message}`);
    }
    const images = (result.data ?? []).map((d) => d.b64_json).filter(Boolean);
    ledger.images += images.length - spec.n;
    ledger.requests.push({ id: spec.id, images: images.length, at: new Date().toISOString() });
    saveLedger();
    images.forEach((b64, i) => writeFileSync(rawPath(spec.id, i), Buffer.from(b64, "base64")));
    console.log(`drew ${spec.id} x${images.length} in ${((Date.now() - started) / 1000).toFixed(0)} s (total ${ledger.images} images, ~$${(ledger.images / 100).toFixed(2)})`);
    if (images.length < spec.n) throw new Error(`${spec.id}: only ${images.length} of ${spec.n} images came back`);
    return outputs;
  })();
  done.set(spec.id, promise);
  return promise;
}

async function drawAll() {
  const wanted = jobs.filter((j) => !ONLY || ONLY.includes(j.id) || REDO.has(j.id));
  const queue = [...wanted];
  const failures = [];
  await Promise.all(
    Array.from({ length: PARALLEL }, async () => {
      while (queue.length) {
        const next = queue.shift();
        try {
          await run(next);
        } catch (error) {
          failures.push(error.message);
        }
      }
    }),
  );
  return failures;
}

/* ---------- Keying ---------- */

/**
 * Cut the flat background out of a chroma-key image. Returns raw RGBA.
 * The background colour is measured from the border, not assumed.
 */
async function keyOut(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const px = (i) => [data[i * 4], data[i * 4 + 1], data[i * 4 + 2]];

  // Median of the border pixels.
  const border = [];
  for (let x = 0; x < w; x += 2) border.push(px(x), px((h - 1) * w + x));
  for (let y = 0; y < h; y += 2) border.push(px(y * w), px(y * w + w - 1));
  const median = (k) => border.map((p) => p[k]).sort((a, b) => a - b)[border.length >> 1];
  const bg = [median(0), median(1), median(2)];

  const dist = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const [r, g, b] = px(i);
    dist[i] = Math.hypot(r - bg[0], g - bg[1], b - bg[2]);
  }

  // Flood fill from the edges through anything close to the background.
  const NEAR = 150;
  const CLEAR = 60;
  const isBg = new Uint8Array(w * h);
  const stack = [];
  const push = (i) => {
    if (!isBg[i] && dist[i] < NEAR) {
      isBg[i] = 1;
      stack.push(i);
    }
  };
  for (let x = 0; x < w; x++) push(x), push((h - 1) * w + x);
  for (let y = 0; y < h; y++) push(y * w), push(y * w + w - 1);
  // Pockets of pure key colour enclosed by the drawing (between an arm and the body, inside curls).
  for (let i = 0; i < w * h; i++) if (dist[i] < 36) push(i);
  while (stack.length) {
    const i = stack.pop();
    const x = i % w;
    if (x > 0) push(i - 1);
    if (x < w - 1) push(i + 1);
    if (i >= w) push(i - w);
    if (i < w * (h - 1)) push(i + w);
  }

  const out = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    let [r, g, b] = px(i);
    let a = 1;
    if (isBg[i]) {
      a = Math.min(1, Math.max(0, (dist[i] - CLEAR) / (NEAR - CLEAR)));
      if (a > 0) {
        // Un-mix the key colour from the edge pixel: C = a*F + (1-a)*B.
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

/** Bounding box of pixels above an alpha threshold. */
function alphaBox({ data, width, height }, threshold = 24) {
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

/** Remove specks: drop every opaque island smaller than `min` pixels. */
function dropSpecks(img, min) {
  const { data, width: w, height: h } = img;
  const seen = new Uint8Array(w * h);
  for (let start = 0; start < w * h; start++) {
    if (seen[start] || data[start * 4 + 3] < 24) continue;
    const island = [start];
    seen[start] = 1;
    for (let k = 0; k < island.length; k++) {
      const i = island[k];
      const x = i % w;
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) {
        if (j >= 0 && j < w * h && !seen[j] && data[j * 4 + 3] >= 24) {
          seen[j] = 1;
          island.push(j);
        }
      }
    }
    if (island.length < min) for (const i of island) data[i * 4 + 3] = 0;
  }
  return img;
}

const toSharp = (img) => sharp(img.data, { raw: { width: img.width, height: img.height, channels: 4 } });

async function fromSharp(pipeline) {
  const { data, info } = await pipeline.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

/** Crop to the drawing plus a margin (fraction of the larger side). */
async function trimmed(img, margin = 0.04) {
  const box = alphaBox(img);
  const pad = Math.round(Math.max(box.w, box.h) * margin);
  const left = Math.max(0, box.x0 - pad);
  const top = Math.max(0, box.y0 - pad);
  return fromSharp(
    toSharp(img).extract({
      left,
      top,
      width: Math.min(img.width - left, box.w + pad * 2),
      height: Math.min(img.height - top, box.h + pad * 2),
    }),
  );
}

/* ---------- Sprites ---------- */

/** Paste only what changed between `base` and `pose` inside the top `region` of the figure. */
function pasteChanges(base, pose, region) {
  const { width: w, height: h } = base;
  const box = alphaBox(base);
  const limit = box.y0 + Math.round(box.h * region);
  const mask = new Float32Array(w * h);
  for (let y = 0; y < limit; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const d =
        Math.abs(base.data[i] - pose.data[i]) +
        Math.abs(base.data[i + 1] - pose.data[i + 1]) +
        Math.abs(base.data[i + 2] - pose.data[i + 2]) +
        Math.abs(base.data[i + 3] - pose.data[i + 3]);
      if (d > 90) mask[y * w + x] = 1;
    }
  }
  // Grow and soften the mask so pasted strokes keep their edges.
  const grown = new Float32Array(w * h);
  const R = 6;
  for (let y = 0; y < limit; y++) {
    for (let x = 0; x < w; x++) {
      if (!mask[y * w + x]) continue;
      for (let dy = -R; dy <= R; dy++) {
        for (let dx = -R; dx <= R; dx++) {
          const yy = y + dy;
          const xx = x + dx;
          if (yy < 0 || yy >= h || xx < 0 || xx >= w) continue;
          const v = 1 - Math.hypot(dx, dy) / (R + 1);
          if (v > grown[yy * w + xx]) grown[yy * w + xx] = v;
        }
      }
    }
  }
  const out = Buffer.from(base.data);
  let changed = 0;
  for (let i = 0; i < w * h; i++) {
    const m = Math.min(1, grown[i] * 1.6);
    if (m <= 0) continue;
    changed++;
    for (let c = 0; c < 4; c++) out[i * 4 + c] = Math.round(base.data[i * 4 + c] * (1 - m) + pose.data[i * 4 + c] * m);
  }
  return { img: { data: out, width: w, height: h }, changed: changed / (box.w * box.h) };
}

/** Line a whole-body pose up with the base by the feet (bottom edge) and the centre of the lower body. */
async function alignByFeet(base, pose) {
  const lowerCentre = (img) => {
    const box = alphaBox(img);
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
    return { x: count ? sum / count : (box.x0 + box.x1) / 2, bottom: box.y1 };
  };
  const a = lowerCentre(base);
  const b = lowerCentre(pose);
  const dx = Math.round(a.x - b.x);
  const dy = Math.round(a.bottom - b.bottom);
  const canvas = sharp({ create: { width: base.width, height: base.height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } });
  const crop = {
    left: Math.max(0, -dx),
    top: Math.max(0, -dy),
  };
  crop.width = Math.min(pose.width - crop.left, base.width - Math.max(0, dx));
  crop.height = Math.min(pose.height - crop.top, base.height - Math.max(0, dy));
  const piece = await toSharp(pose).extract(crop).png().toBuffer();
  return fromSharp(canvas.composite([{ input: piece, left: Math.max(0, dx), top: Math.max(0, dy) }]));
}

async function loadPose(id, size) {
  const keyed = dropSpecks(await keyOut(rawPath(id)), 400);
  if (keyed.width === size.width && keyed.height === size.height) return keyed;
  return fromSharp(toSharp(keyed).resize(size.width, size.height, { fit: "fill" }));
}

const SPRITE_FRAME = { mimo: [300, 270] };
const HEAD_REGION = { mimo: 0.8, mishmish: 0.5, nour: 0.32, karim: 0.3, teta: 0.34 };

async function buildSprite(id) {
  const base = dropSpecks(await keyOut(rawPath(`${id}-idle`)), 400);
  const size = { width: base.width, height: base.height };
  const notes = [];

  const headPose = async (name) => {
    const pose = await loadPose(`${id}-${name}`, size);
    const { img, changed } = pasteChanges(base, pose, HEAD_REGION[id]);
    notes.push(`${name}: pasted ${(changed * 100).toFixed(1)}% of the figure`);
    return img;
  };
  const blink = await headPose("blink");
  const talk = await headPose("talk");
  const wave1 = await alignByFeet(base, await loadPose(`${id}-wave1`, size));
  const wave2 = await alignByFeet(base, await loadPose(`${id}-wave2`, size));

  // One crop for every frame, so nothing jumps between rows.
  const boxes = [base, blink, talk, wave1, wave2].map((img) => alphaBox(img));
  const union = {
    x0: Math.min(...boxes.map((b) => b.x0)),
    y0: Math.min(...boxes.map((b) => b.y0)),
    x1: Math.max(...boxes.map((b) => b.x1)),
    y1: Math.max(...boxes.map((b) => b.y1)),
  };
  const [fw, fh] = SPRITE_FRAME[id] ?? [300, 360];
  const SCALE_UP = 1; // 300 px frames: the stickers show at about 150 CSS px, so this is 2x on phones
  const cellW = fw * SCALE_UP;
  const cellH = fh * SCALE_UP;
  const unionW = union.x1 - union.x0 + 1;
  const unionH = union.y1 - union.y0 + 1;
  const scale = Math.min((cellW * 0.92) / unionW, (cellH * 0.94) / unionH);
  const drawW = Math.round(unionW * scale);
  const drawH = Math.round(unionH * scale);
  const offX = Math.round((cellW - drawW) / 2);
  const offY = cellH - drawH - Math.round(cellH * 0.02);

  const frame = async (img, breathe = 0) => {
    const piece = toSharp(img).extract({ left: union.x0, top: union.y0, width: unionW, height: unionH });
    // Breathing: a slight stretch from the feet up.
    const h = Math.round(drawH * (1 + breathe));
    const w = Math.round(drawW * (1 - breathe * 0.5));
    const buf = await piece.resize(w, h, { fit: "fill" }).png().toBuffer();
    return { input: buf, w, h };
  };

  const I = await frame(base);
  const B = await frame(blink);
  const T = await frame(talk);
  const W1 = await frame(wave1);
  const W2 = await frame(wave2);
  const breaths = await Promise.all([0, 0.006, 0.012, 0.016, 0.012, 0.006].map((k) => frame(base, k)));

  const rows = [breaths, [I, B, B, B, I, I], [I, T, T, I, T, I], [I, W1, W2, W1, W2, I]];
  const composites = [];
  rows.forEach((row, r) =>
    row.forEach((f, c) =>
      composites.push({
        input: f.input,
        left: c * cellW + Math.round((cellW - f.w) / 2),
        top: r * cellH + offY + (drawH - f.h),
      }),
    ),
  );
  void offX;
  const sheet = sharp({ create: { width: cellW * 6, height: cellH * 4, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(
    composites,
  );
  await sheet.webp({ quality: 80, alphaQuality: 90, effort: 6 }).toFile(path.join(OUT, `sprite-${id}.webp`));

  // The still: the idle frame on its own.
  const still = await sharp({ create: { width: cellW, height: cellH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: I.input, left: Math.round((cellW - I.w) / 2), top: offY }])
    .webp({ quality: 88, alphaQuality: 100 })
    .toBuffer();
  await sharp(still).toFile(path.join(OUT, `portrait-${id}.webp`));
  console.log(`sprite-${id}.webp ${cellW * 6}x${cellH * 4} (${notes.join(", ")})`);
  return still;
}

/* ---------- Everything else ---------- */

async function writeCutout(id, name, maxWidth = 1200) {
  const img = await trimmed(dropSpecks(await keyOut(rawPath(id)), 300));
  const out = path.join(OUT, `${name}.webp`);
  const info = await toSharp(img).resize({ width: maxWidth, withoutEnlargement: true }).webp({ quality: 86, alphaQuality: 100 }).toFile(out);
  console.log(`${name}.webp ${info.width}x${info.height}`);
}

async function writePlate(file, name, maxWidth) {
  const info = await sharp(file).resize({ width: maxWidth, withoutEnlargement: true }).webp({ quality: 84 }).toFile(path.join(OUT, `${name}.webp`));
  console.log(`${name}.webp ${info.width}x${info.height}`);
}

async function writeMoods() {
  const img = dropSpecks(await keyOut(rawPath("moods")), 60);
  const names = ["sunny", "cloudy", "rainy", "stormy", "rainbow"];
  // The stickers are evenly spaced: cut near each fifth of the width, at the emptiest column close by.
  const inked = new Uint32Array(img.width);
  for (let x = 0; x < img.width; x++) {
    for (let y = 0; y < img.height; y++) if (img.data[(y * img.width + x) * 4 + 3] > 24) inked[x]++;
  }
  const cuts = [0];
  for (let k = 1; k < 5; k++) {
    const target = Math.round((img.width * k) / 5);
    const reach = Math.round(img.width * 0.06);
    let best = target;
    for (let x = target - reach; x <= target + reach; x++) if (inked[x] < inked[best]) best = x;
    cuts.push(best);
  }
  cuts.push(img.width);
  for (let k = 0; k < 5; k++) {
    const piece = await fromSharp(toSharp(img).extract({ left: cuts[k], top: 0, width: cuts[k + 1] - cuts[k], height: img.height }));
    await toSharp(await trimmed(piece, 0.06))
      .resize(256, 256, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .webp({ quality: 90, alphaQuality: 100 })
      .toFile(path.join(OUT, `mood-${names[k]}.webp`));
  }
  console.log("mood-*.webp 256x256 x5");
}

async function processAll() {
  const step = async (label, fn) => {
    try {
      await fn();
    } catch (error) {
      console.warn(`skipped ${label}: ${error.message}`);
    }
  };
  for (const [id] of SPRITE_CAST) await step(`sprite ${id}`, () => buildSprite(id));
  await step("logo", async () => {
    const mimo = await trimmed(dropSpecks(await keyOut(rawPath("mimo-idle")), 400), 0.03);
    await toSharp(mimo)
      .resize(192, 192, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(path.join(OUT, "logo-mimo.png"));
    await toSharp(mimo)
      .resize(520, 520, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .webp({ quality: 88, alphaQuality: 100 })
      .toFile(path.join(OUT, "mimo.webp"));
    console.log("logo-mimo.png, mimo.webp");
  });
  await step("hero", () => writePlate(rawPath("hero", Number(flag("hero-pick", 0))), "hero-night", 2400));
  for (const id of ["how-talk", "how-comic", "how-book", "empty-cast", "empty-month", "empty-days"]) await step(id, () => writeCutout(id, id));
  await step("moods", writeMoods);
  await step("month-cover", () => writePlate(rawPath("month-cover"), "month-cover", 1000));
  for (const style of ["zine", "painterly"]) await step(`before ${style}`, () => writePlate(rawPath(`demo-before-${style}`), `demo-before-${style}`, 1600));
}

/* ---------- Main ---------- */

if (!PROCESS_ONLY) {
  const failures = await drawAll();
  for (const failure of failures) console.warn(`not drawn: ${failure}`);
}
await processAll();
console.log(`Ledger: ${ledger.images} images, about $${(ledger.images / 100).toFixed(2)}. Raw files in ${WORK}/raw`);
