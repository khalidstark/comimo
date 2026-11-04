// Turns the real Comimo runs of the sample days into shipped art and fixture data.
//
// Each run is what the app saved after one sample transcript was typed into /record on a
// server with the real models: `day.json` (the Day from the browser's store) and its panel
// images (`img-panel-<n>.<ext>`, `img-panel-<n>-before.<ext>` when SAM had a face redrawn).
//
//   node scripts/sample-comics.mjs <runsDir>
//
// Writes public/art/samples/*.webp, src/art/samplePanels.ts and src/fixtures/sampleComics.ts.
// Nothing is invented here: the text, boxes, checks and cost are copied from the runs.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const SAMPLE_IDS = ["sample-teta", "sample-deadline", "sample-rooftop", "sample-sunday", "sample"];
const MAX_WIDTH = 1600;
const QUALITY = 80;

const [runs] = process.argv.slice(2);
if (!runs) {
  console.error("usage: node scripts/sample-comics.mjs <runsDir>");
  process.exit(1);
}

const root = new URL("..", import.meta.url).pathname;
const artDir = join(root, "public/art/samples");
mkdirSync(artDir, { recursive: true });

const round = (n) => Math.round(n * 10000) / 10000;
const roundBox = (box) => ({ x: round(box.x), y: round(box.y), w: round(box.w), h: round(box.h) });

/** The scene's first sentence, as alt text. */
function altFrom(scene) {
  const first = scene.replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s/)[0];
  return first.length > 180 ? `${first.slice(0, 177).trimEnd()}…` : first;
}

/** Files written this run; anything else in the folder is an old drawing and is removed. */
const written = new Set();

/**
 * The file name carries a hash of its content, so a sample drawn again gets a
 * new URL: the image optimiser, the CDN and browsers cache by URL and would
 * otherwise keep showing the old drawing.
 */
async function toWebp(source, name) {
  const { data, info } = await sharp(source).resize({ width: MAX_WIDTH, withoutEnlargement: true }).webp({ quality: QUALITY }).toBuffer({ resolveWithObject: true });
  const file = `${name}-${createHash("sha256").update(data).digest("hex").slice(0, 8)}.webp`;
  writeFileSync(join(artDir, file), data);
  written.add(file);
  return { file, width: info.width, height: info.height, bytes: info.size };
}

const assets = {};
const comics = {};
let totalUsd = 0;
let totalBytes = 0;

for (const id of SAMPLE_IDS) {
  const dir = join(runs, id);
  const day = JSON.parse(readFileSync(join(dir, "day.json"), "utf8"));
  const files = readdirSync(dir);
  const fileFor = (stem) => {
    const file = files.find((f) => f.startsWith(`${stem}.`));
    if (!file) throw new Error(`${id}: no ${stem}`);
    return join(dir, file);
  };

  const panels = [];
  for (const panel of [...day.panels].sort((a, b) => a.index - b.index)) {
    const key = `${id}-${panel.index}`;
    const drawn = await toWebp(fileFor(`img-panel-${panel.index}`), key);
    totalBytes += drawn.bytes;
    assets[key] = { file: drawn.file, alt: altFrom(panel.scene), width: drawn.width, height: drawn.height };
    let beforeImage = null;
    if (panel.consistency.beforeImage) {
      const beforeKey = `${key}-before`;
      const before = await toWebp(fileFor(`img-panel-${panel.index}-before`), beforeKey);
      totalBytes += before.bytes;
      assets[beforeKey] = { file: before.file, alt: "The same panel before SAM 3.1's face fix", width: before.width, height: before.height };
      beforeImage = { kind: "art", path: `samples.${beforeKey}` };
    }
    const { consistency } = panel;
    panels.push({
      index: panel.index,
      scene: panel.scene,
      ...(panel.caption ? { caption: panel.caption } : {}),
      ...(panel.narration ? { narration: panel.narration } : {}),
      ...(panel.flashback ? { flashback: true } : {}),
      dialogue: panel.dialogue,
      characterIds: panel.characterIds,
      ...(panel.names ? { names: panel.names } : {}),
      ...(panel.shot ? { shot: panel.shot } : {}),
      ...(panel.beat ? { beat: panel.beat } : {}),
      ...(panel.emphasis ? { emphasis: true } : {}),
      ...(panel.frame ? { frame: panel.frame } : {}),
      image: { kind: "art", path: `samples.${key}` },
      consistency: {
        checked: consistency.checked,
        driftedCharacterIds: consistency.driftedCharacterIds,
        fixedCharacterIds: consistency.fixedCharacterIds,
        beforeImage,
        ...(consistency.method ? { method: consistency.method } : {}),
        ...(consistency.sam ? { sam: consistency.sam } : {}),
      },
      ...(panel.figures
        ? {
            figures: {
              aspect: round(panel.figures.aspect),
              items: panel.figures.items.map((item) => ({
                ...(item.characterId ? { characterId: item.characterId } : {}),
                kind: item.kind,
                box: roundBox(item.box),
                head: roundBox(item.head),
              })),
            },
          }
        : {}),
    });
  }

  if (!day.cost || day.cost.mock) throw new Error(`${id}: not a real run (cost ${JSON.stringify(day.cost)})`);
  totalUsd += day.cost.usd;
  comics[id] = {
    title: day.title,
    languages: day.languages,
    mood: day.mood,
    heavy: day.heavy,
    ...(day.heavy && day.checkIn?.questions?.length ? { checkIn: { questions: day.checkIn.questions, answers: [] } } : {}),
    safety: day.safety,
    artStyle: day.artStyle,
    storyMode: day.storyMode,
    ...(day.layout ? { layout: day.layout } : {}),
    ...(day.pages ? { pages: day.pages } : {}),
    ...(day.oneOffs?.length ? { oneOffs: day.oneOffs } : {}),
    cost: day.cost,
    panels,
  };
}

const header = (what) => `// Generated by scripts/sample-comics.mjs from the real runs of the sample days. Do not edit by hand.\n// ${what}\n`;

const assetLines = Object.entries(assets)
  .map(([key, a]) => `  ${JSON.stringify(key)}: drawn(${JSON.stringify(a.file)}, ${JSON.stringify(a.alt)}, ${a.width}, ${a.height}),`)
  .join("\n");
writeFileSync(
  join(root, "src/art/samplePanels.ts"),
  `${header("The sample days' panels, drawn by Muse Image from the starter cast's zine sheets.")}import type { ArtAsset } from "./manifest";

function drawn(file: string, alt: string, width: number, height: number): ArtAsset {
  return { src: \`/art/samples/\${file}\`, alt, width, height, placeholder: false };
}

export const samplePanels = {
${assetLines}
} as const satisfies Record<string, ArtAsset>;
`,
);

writeFileSync(
  join(root, "src/fixtures/sampleComics.ts"),
  `${header("What the real pipeline made of each sample transcript: script, panels, SAM 3.1 boxes and checks, cost.")}import type { Day } from "@/lib/types";

export type SampleComic = Pick<Day, "title" | "languages" | "mood" | "heavy" | "checkIn" | "safety" | "artStyle" | "storyMode" | "layout" | "pages" | "oneOffs" | "cost" | "panels">;

export const sampleComics: Record<${SAMPLE_IDS.map((id) => JSON.stringify(id)).join(" | ")}, SampleComic> = ${JSON.stringify(comics, null, 2)};
`,
);

const stale = readdirSync(artDir).filter((file) => !written.has(file));
for (const file of stale) rmSync(join(artDir, file));

console.log(`${Object.keys(assets).length} images, ${(totalBytes / 1024).toFixed(0)} KB, ${stale.length} old files removed; comics cost $${totalUsd.toFixed(4)}`);
