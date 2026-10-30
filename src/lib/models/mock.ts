import "server-only";
import { starterCastById } from "@/fixtures/cast";
import { sampleDays } from "@/fixtures/days";
import type { CastBrief, ComicScript, Day, ScriptPanel, Transcript } from "@/lib/types";
import type { AudioInput, CharacterReference, ComicModels, ConsistencyResult, ModelImage } from "./index";

/**
 * Mock models: answers come from the sample-day fixtures and panels are
 * simple SVG cards, after short delays so progress UI has something to show.
 * Nothing here touches the network.
 */

const DELAY_MS = {
  transcribe: 1200,
  script: 1600,
  draw: 900,
  check: 600,
} as const;

function wait(ms: number): Promise<void> {
  // A little jitter so progress steps don't tick in lockstep.
  const jitter = Math.round(ms * 0.25 * Math.random());
  return new Promise((resolve) => setTimeout(resolve, ms + jitter));
}

/** FNV-1a, for picking fixtures deterministically. */
function hash(input: string | Uint8Array): number {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  let h = 0x811c9dc5;
  for (const byte of bytes) {
    h ^= byte;
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/* ---------- Transcribe ---------- */

async function transcribe(audio: AudioInput): Promise<Transcript> {
  await wait(DELAY_MS.transcribe);
  const pool =
    audio.languageHint === "auto"
      ? sampleDays
      : sampleDays.filter((day) => day.languages.dominant === audio.languageHint);
  const days = pool.length > 0 ? pool : sampleDays;
  const day = days[audio.data.byteLength % days.length];
  return { text: day.transcript, languages: day.languages };
}

/* ---------- Script ---------- */

/**
 * Mock stand-in for the script model's safety check, so the helpline path can
 * be built. The real check is done by the model in Phase 3.
 */
const CRISIS_HINTS = ["[mock:crisis]", "hurt myself", "kill myself", "end my life", "suicide", "انتحار", "أؤذي نفسي", "أموت نفسي", "مش عايز أعيش"];
const HEAVY_HINTS = ["[mock:heavy]", "deadline", "overwhelmed", "stressed", "ديدلاين", "مش هلحق", "مضغوط", "مخنوق"];

function includesAny(text: string, hints: string[]): boolean {
  const lower = text.toLowerCase();
  return hints.some((hint) => lower.includes(hint));
}

function pickDay(transcript: string): Day {
  const text = transcript.trim();
  const exact = sampleDays.find((day) => day.transcript === text);
  if (exact) return exact;
  const heavyDays = sampleDays.filter((day) => day.heavy);
  const lightDays = sampleDays.filter((day) => !day.heavy);
  const pool = includesAny(text, HEAVY_HINTS) ? heavyDays : lightDays;
  return pool[hash(text) % pool.length];
}

/** Point fixture characters at the caller's cast: same id if present, else the first member with the same role. */
function castMapper(cast: CastBrief[]): (id: string) => string {
  const ids = new Set(cast.map((member) => member.id));
  const byRole = new Map<string, string>();
  for (const member of cast) if (!byRole.has(member.role)) byRole.set(member.role, member.id);
  return (id) => {
    if (ids.has(id)) return id;
    const role = starterCastById[id]?.role;
    return (role && byRole.get(role)) || id;
  };
}

async function writeScript(transcript: string, cast: CastBrief[]): Promise<ComicScript> {
  await wait(DELAY_MS.script);

  if (includesAny(transcript, CRISIS_HINTS)) {
    return { title: "", panels: [], mood: "rainy", heavy: true, checkInQuestions: [], safety: "crisis" };
  }

  const day = pickDay(transcript);
  const toCast = castMapper(cast);
  const panels: ScriptPanel[] = day.panels.map(({ index, scene, caption, dialogue, characterIds }) => ({
    index,
    scene,
    caption,
    dialogue: dialogue.map((line) => ({ ...line, speakerId: toCast(line.speakerId) })),
    characterIds: characterIds.map(toCast),
  }));

  return {
    title: day.title,
    panels,
    mood: day.mood,
    heavy: day.heavy,
    checkInQuestions: day.heavy ? (day.checkIn?.questions ?? []) : [],
    safety: day.safety,
  };
}

/* ---------- Draw ---------- */

const SVG_TYPE = "image/svg+xml";
const INK = "#1b2148";
const PAPER = "#eceff2";
const PINK = "#f2397a";
const SUN = "#ffc738";

function escapeXml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function wrap(text: string, width: number, maxLines: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (line && (line + " " + word).length > width) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    lines[maxLines - 1] += "…";
  }
  return lines;
}

/**
 * A mock panel card. The top-start corner stays empty because the app lays its
 * own chrome there (panel number badge, caption box); the scene sits in the
 * middle band and the label in the bottom-end corner, so a 2:1 crop keeps both.
 */
function panelSvg(panel: ScriptPanel, references: CharacterReference[]): string {
  const names = panel.characterIds.map(
    (id) => references.find((ref) => ref.characterId === id)?.name ?? starterCastById[id]?.name ?? id,
  );
  const sceneLines = wrap(panel.scene, 46, 4)
    .map((line, i) => `<tspan x="40" dy="${i === 0 ? 0 : 30}">${escapeXml(line)}</tspan>`)
    .join("");
  const chips = names
    .slice(0, 3)
    .map((name, i) => {
      const x = 40 + i * 116;
      return `<g transform="translate(${x} 288)"><rect width="106" height="38" rx="19" fill="${SUN}" stroke="${INK}" stroke-width="3"/><text x="53" y="25" text-anchor="middle" font-size="16" font-weight="700" fill="${INK}">${escapeXml(name)}</text></g>`;
    })
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400" font-family="system-ui, sans-serif">
<rect x="6" y="6" width="588" height="388" fill="${PAPER}" stroke="${INK}" stroke-width="8"/>
<text x="40" y="150" font-size="22" fill="${INK}">${sceneLines}</text>
${chips}
<rect x="404" y="290" width="164" height="34" fill="${INK}"/>
<text x="486" y="313" text-anchor="middle" font-size="16" font-weight="700" fill="${PAPER}">MOCK PANEL ${panel.index + 1}</text>
</svg>`;
}

async function drawPanel(panel: ScriptPanel, references: CharacterReference[]): Promise<ModelImage> {
  await wait(DELAY_MS.draw);
  return { mimeType: SVG_TYPE, data: new TextEncoder().encode(panelSvg(panel, references)) };
}

/* ---------- Consistency ---------- */

function stampFixed(image: ModelImage, name: string): ModelImage {
  if (image.mimeType !== SVG_TYPE) return image;
  const svg = new TextDecoder().decode(image.data);
  const stamp = `<g transform="translate(414 62) rotate(6)"><rect width="150" height="44" fill="${PINK}" stroke="${INK}" stroke-width="3"/><text x="75" y="29" text-anchor="middle" font-size="18" font-weight="700" fill="${PAPER}">FIXED: ${escapeXml(name)}</text></g>`;
  return { mimeType: SVG_TYPE, data: new TextEncoder().encode(svg.replace("</svg>", `${stamp}\n</svg>`)) };
}

/**
 * Pretends roughly one panel in three has a drifted character, chosen from the
 * image bytes so the same panel always gives the same answer.
 */
async function checkConsistency(image: ModelImage, references: CharacterReference[]): Promise<ConsistencyResult> {
  await wait(DELAY_MS.check);
  if (references.length === 0) return { driftedCharacterIds: [], fixedImage: null };
  const h = hash(image.data);
  if (h % 3 !== 0) return { driftedCharacterIds: [], fixedImage: null };
  const drifted = references[h % references.length];
  return { driftedCharacterIds: [drifted.characterId], fixedImage: stampFixed(image, drifted.name) };
}

export const mockModels: ComicModels = {
  mode: "mock",
  transcribe,
  writeScript,
  drawPanel,
  checkConsistency,
};
