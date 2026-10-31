#!/usr/bin/env node
/**
 * Three invented "phone photos" of the walkthrough's dinner for the photo
 * album step, drawn by Muse Image (3 x $0.01). No people in them.
 * Raw answers are cached in --work; the key only goes to api.meta.ai.
 *
 *   node --env-file=../.env.local scripts/draw-photos.mjs --work /tmp/photos
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const args = process.argv.slice(2);
const WORK = args[args.indexOf("--work") + 1];
if (!WORK || args.indexOf("--work") === -1) throw new Error("usage: draw-photos.mjs --work <dir>");
if (!process.env.MODEL_API_KEY) throw new Error("MODEL_API_KEY is not set");
const OUT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../public/own/photos");
mkdirSync(WORK, { recursive: true });
mkdirSync(OUT, { recursive: true });

const STYLE =
  "A casual, candid smartphone photo, natural and slightly imperfect: real photograph, not an illustration. No people and no faces in the picture. No text, signs, labels or logos anywhere.";
const PHOTOS = {
  basbousa: "Overhead phone photo of an opened white cardboard cake box full of golden diamond-cut basbousa squares with almonds, glistening with syrup, on a small kitchen table with a floral oilcloth.",
  candles: "Phone photo of a small kitchen table at night during a power cut, lit only by two white candles: plates of molokhia and rice, bread, glasses of water, warm golden candlelight and deep shadows.",
  mishmish: "Phone photo taken low under a kitchen table: a fluffy ginger cat sitting on the tiled floor between chair legs, looking up hopefully, warm evening light.",
};

let spent = 0;
for (const [name, scene] of Object.entries(PHOTOS)) {
  const raw = path.join(WORK, `${name}.webp`);
  if (!existsSync(raw)) {
    const response = await fetch("https://api.meta.ai/v1/images/generations", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.MODEL_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "muse-image-1.0",
        n: 1,
        size: "1024x1024",
        output_format: "webp",
        tool_enablement: { enable_image_search: false, enable_web_search: false, enable_shell: false },
        prompt: `${scene}\n${STYLE}`,
      }),
      signal: AbortSignal.timeout(180_000),
    });
    spent += 0.01;
    if (!response.ok) throw new Error(`${name} ${response.status}: ${(await response.text()).slice(0, 300)}`);
    const b64 = (await response.json()).data?.[0]?.b64_json;
    if (!b64) throw new Error(`${name}: no image`);
    writeFileSync(raw, Buffer.from(b64, "base64"));
  }
  await sharp(readFileSync(raw)).resize(720, 720).webp({ quality: 82 }).toFile(path.join(OUT, `${name}.webp`));
  console.log(name);
}
console.log(`Done. This run spent about $${spent.toFixed(2)}.`);
