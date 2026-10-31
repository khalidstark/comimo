import "server-only";
import { starterCastById } from "@/fixtures/cast";
import { sampleDays, sampleNarration } from "@/fixtures/days";
import { localPanels } from "@/lib/layout/comicPages";
import { normalizeStory } from "@/lib/layout/pickLayout";
import { DEFAULT_STORY_MODE, type CastBrief, type ComicPage, type ComicScript, type Day, type PanelFrame, type ScriptPanel, type Transcript } from "@/lib/types";
import type { AudioInput, CharacterReference, ComicModels, ConsistencyResult, ModelImage, PanelOptions, ScriptOptions, SheetSubject } from "./index";
import { applyStoryMode } from "./storyMode";

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
 * Mock stand-in for the script model's safety check, so the no-comic path can
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

/** Long notes (or "[mock:pages]") get a second page, so multi-page comics can be built without credits. */
const PAGES_HINT = "[mock:pages]";
const LONG_NOTE = 700;

/** One mock page from a sample day: its panels (with narration) plus 0 to 2 quiet beats, by hash. */
function mockPage(day: Day, transcript: string, toCast: (id: string) => string, cast: CastBrief[]): ScriptPanel[] {
  const narration = sampleNarration[day.id] ?? [];
  const story: ScriptPanel[] = day.panels.map(({ index, scene, caption, dialogue, characterIds, shot, beat }) => ({
    index,
    scene,
    caption,
    ...(narration[index] ? { narration: narration[index] } : {}),
    dialogue: dialogue.map((line) => ({ ...line, speakerId: toCast(line.speakerId) })),
    characterIds: characterIds.map(toCast),
    shot,
    beat,
  }));
  // The samples have 4 panels; add quiet beats so mock comics also come in 5 and 6 panels.
  const extra = hash(transcript + day.id) % 3;
  const who = story[1].characterIds[0];
  const name = cast.find((member) => member.id === who)?.name ?? (who ? starterCastById[who]?.name : undefined) ?? "the speaker";
  const beats: ScriptPanel[] = [
    {
      index: 0,
      scene: `Close on ${name}'s face, a small reaction to what just happened.`,
      narration: "For a second I just let it sink in.",
      dialogue: [],
      characterIds: story[1].characterIds.slice(0, 1),
      shot: "closeup",
      beat: "build",
    },
    {
      index: 0,
      scene: "A small detail of the scene: hands, a cup, a phone screen, the light through the window.",
      caption: "Meanwhile…",
      narration: "Somewhere in the middle of it all, the small things kept happening anyway.",
      dialogue: [],
      characterIds: [],
      shot: "detail",
      beat: "build",
    },
  ];
  story.splice(2, 0, ...beats.slice(0, extra));
  return normalizeStory(localPanels(story));
}

async function writeScript(transcript: string, cast: CastBrief[], _context?: unknown, options: ScriptOptions = {}): Promise<ComicScript> {
  await wait(DELAY_MS.script);
  const mode = options.storyMode ?? DEFAULT_STORY_MODE;

  if (includesAny(transcript, CRISIS_HINTS)) {
    return { title: "", panels: [], mood: "rainy", heavy: true, checkInQuestions: [], safety: "crisis" };
  }

  const day = pickDay(transcript);
  const toCast = castMapper(cast);
  const days = [day];
  if (transcript.includes(PAGES_HINT) || transcript.length > LONG_NOTE) {
    days.push(sampleDays[(sampleDays.indexOf(day) + 1) % sampleDays.length]);
  }
  const groups: number[][] = [];
  const panels: ScriptPanel[] = [];
  for (const source of days) {
    const page = mockPage(source, transcript, toCast, cast);
    groups.push(page.map((_, i) => panels.length + i));
    panels.push(...page.map((panel, i) => ({ ...panel, index: panels.length + i })));
  }
  const pages: ComicPage[] = groups.map((group) => ({ panels: group }));

  return {
    title: day.title,
    panels: applyStoryMode(panels, groups, mode),
    pages,
    storyMode: mode,
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
 * A mock panel card at the slot's aspect ratio. The lettering zone is shown
 * as a pale hatched area (that is where the app letters the caption and
 * bubbles); the scene, cast chips and label sit in the rest of the frame.
 */
function panelSvg(panel: ScriptPanel, references: CharacterReference[], frame: PanelFrame): string {
  const W = 600;
  const H = Math.round(W / frame.aspect);
  const { side, size } = frame.zone;
  const zone =
    side === "top" ? { x: 0, y: 0, w: W, h: H * size } : side === "left" ? { x: 0, y: 0, w: W * size, h: H } : side === "right" ? { x: W * (1 - size), y: 0, w: W * size, h: H } : null;
  const area = {
    x: side === "left" ? W * size : 0,
    y: side === "top" ? H * size : 0,
    w: side === "left" || side === "right" ? W * (1 - size) : W,
    h: side === "top" ? H * (1 - size) : H,
  };
  const font = Math.max(12, Math.min(18, Math.min(area.w, area.h) / 10));
  const names = panel.characterIds.map(
    (id) => references.find((ref) => ref.characterId === id)?.name ?? starterCastById[id]?.name ?? id,
  );
  const shot = (panel.shot ?? "panel").toUpperCase();
  const maxLines = Math.max(1, Math.floor((area.h - font * 4.5) / (font * 1.35)));
  const sceneLines = wrap(panel.scene, Math.max(12, Math.floor((area.w - 60) / (font * 0.52))), Math.min(5, maxLines))
    .map((line, i) => `<tspan x="${area.x + 28}" dy="${i === 0 ? 0 : Math.round(font * 1.35)}">${escapeXml(line)}</tspan>`)
    .join("");
  const chipW = Math.min(106, (area.w - 56) / 3 - 8);
  const chips = names
    .slice(0, 3)
    .map((name, i) => {
      const x = area.x + 28 + i * (chipW + 8);
      const y = area.y + area.h - font * 3.6;
      return `<g transform="translate(${x} ${y})"><rect width="${chipW}" height="${font * 1.6}" rx="${font * 0.8}" fill="${SUN}" stroke="${INK}" stroke-width="3"/><text x="${chipW / 2}" y="${font * 1.1}" text-anchor="middle" font-size="${font * 0.72}" font-weight="700" fill="${INK}">${escapeXml(name)}</text></g>`;
    })
    .join("");
  const hatch = zone
    ? `<rect x="${zone.x}" y="${zone.y}" width="${zone.w}" height="${zone.h}" fill="url(#hatch)"/>`
    : "";
  const covered = frame.covered
    ? (() => {
        const cw = W * 0.36;
        const ch = H * 0.36;
        const cx = frame.covered.endsWith("left") ? 0 : W - cw;
        const cy = frame.covered.startsWith("top") ? 0 : H - ch;
        return `<rect x="${cx}" y="${cy}" width="${cw}" height="${ch}" fill="${PINK}" fill-opacity="0.12"/>`;
      })()
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="system-ui, sans-serif">
<defs><pattern id="hatch" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)"><rect width="12" height="12" fill="#f7f8fa"/><line x1="0" y1="0" x2="0" y2="12" stroke="${INK}" stroke-opacity="0.08" stroke-width="3"/></pattern></defs>
<rect width="${W}" height="${H}" fill="${PAPER}"/>
${hatch}${covered}
<text x="${area.x + 28}" y="${area.y + font * 2}" font-size="${font}" fill="${INK}">${sceneLines}</text>
${chips}
<rect x="${W - 210}" y="${H - font * 2.4}" width="190" height="${font * 1.7}" fill="${INK}"/>
<text x="${W - 115}" y="${H - font * 1.15}" text-anchor="middle" font-size="${font * 0.7}" font-weight="700" fill="${PAPER}">MOCK ${panel.index + 1} · ${escapeXml(shot)}</text>
</svg>`;
}

async function drawPanel(panel: ScriptPanel, references: CharacterReference[], { frame }: PanelOptions): Promise<ModelImage> {
  await wait(DELAY_MS.draw);
  return { mimeType: SVG_TYPE, data: new TextEncoder().encode(panelSvg(panel, references, frame)) };
}

/* ---------- Reference sheets ---------- */

/** Two plain figures (front and three-quarter) with the name, so the cast flow can be built without credits. */
function sheetSvg(name: string, style: string): string {
  const figure = (x: number, turn: number) =>
    `<g transform="translate(${x} 0)"><circle cx="${150 + turn}" cy="150" r="58" fill="${SUN}" stroke="${INK}" stroke-width="6"/><path d="M${92 + turn} 330 q58 -110 116 0 v170 h-116 z" fill="${PINK}" stroke="${INK}" stroke-width="6"/><path d="M110 500 v120 M190 500 v120" stroke="${INK}" stroke-width="10" stroke-linecap="round"/></g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600" viewBox="0 0 900 600" font-family="system-ui, sans-serif">
<rect width="900" height="600" fill="${PAPER}"/>
${figure(90, 0)}${figure(510, 18)}
<rect x="300" y="540" width="300" height="40" fill="${INK}"/>
<text x="450" y="567" text-anchor="middle" font-size="18" font-weight="700" fill="${PAPER}">MOCK ${escapeXml(style.toUpperCase())} SHEET: ${escapeXml(name)}</text>
</svg>`;
}

async function drawReferenceSheet(subject: SheetSubject): Promise<ModelImage> {
  await wait(DELAY_MS.draw * 2);
  return { mimeType: SVG_TYPE, data: new TextEncoder().encode(sheetSvg(subject.name, subject.style)) };
}

/** Mock sheets are never uploaded anywhere. */
async function uploadReference(): Promise<string | null> {
  return null;
}

/* ---------- Consistency ---------- */

function stampFixed(image: ModelImage, name: string): ModelImage {
  if (image.mimeType !== SVG_TYPE) return image;
  const svg = new TextDecoder().decode(image.data);
  const [, w = "600", h = "400"] = /viewBox="0 0 (\d+) (\d+)"/.exec(svg) ?? [];
  const stamp = `<g transform="translate(${Number(w) - 186} ${Math.round(Number(h) * 0.55)}) rotate(6)"><rect width="150" height="44" fill="${PINK}" stroke="${INK}" stroke-width="3"/><text x="75" y="29" text-anchor="middle" font-size="18" font-weight="700" fill="${PAPER}">FIXED: ${escapeXml(name)}</text></g>`;
  return { mimeType: SVG_TYPE, data: new TextEncoder().encode(svg.replace("</svg>", `${stamp}\n</svg>`)) };
}

/**
 * Pretends roughly one panel in three has a drifted character, chosen from the
 * image bytes so the same panel always gives the same answer. Only mock (SVG)
 * panels get a pretend fix: a real drawn panel can't be stamped, and a "fixed"
 * badge over an unchanged image would mislead.
 */
async function checkConsistency(image: ModelImage, references: CharacterReference[]): Promise<ConsistencyResult> {
  await wait(DELAY_MS.check);
  const none: ConsistencyResult = { driftedCharacterIds: [], fixedCharacterIds: [], fixedImage: null, method: "mock" };
  if (references.length === 0 || image.mimeType !== SVG_TYPE) return none;
  const h = hash(image.data);
  if (h % 3 !== 0) return none;
  const drifted = references[h % references.length];
  return { ...none, driftedCharacterIds: [drifted.characterId], fixedCharacterIds: [drifted.characterId], fixedImage: stampFixed(image, drifted.name) };
}

export const mockModels: ComicModels = {
  mode: "mock",
  sources: { transcribe: "mock", writeScript: "mock", drawReferenceSheet: "mock", drawPanel: "mock", checkConsistency: "mock" },
  transcribe,
  writeScript,
  drawReferenceSheet,
  uploadReference,
  drawPanel,
  checkConsistency,
};
