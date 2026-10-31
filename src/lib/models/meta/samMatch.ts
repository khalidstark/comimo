import type { PanelFigure, PanelFigures, UnitBox } from "@/lib/types";

/**
 * The pure half of the SAM 3.1 step (no network, no images): the noun phrase
 * SAM is asked for each character, how detections are merged and matched to
 * cast members, and where a figure's head is. Unit-tested in samMatch.test.ts.
 */

/* ---------- Noun phrases ---------- */

const ANIMALS = ["cat", "kitten", "dog", "puppy", "parrot", "bird", "rabbit", "bunny", "hamster", "turtle", "tortoise", "horse", "goat", "fish"];
const ANIMAL_SKIP = new Set(["a", "an", "the", "chubby", "small", "big", "large", "little", "tiny", "fat", "fluffy", "old", "young", "very", "cute", "skinny", "lazy", "sleepy"]);
const HAIR_WORDS = /\b(curly|wavy|straight|braided|long|short|shoulder-length|cropped|messy|black|dark|brown|blonde|blond|red|ginger|auburn|grey|gray|silver|white|pink|blue|purple|green|bald|afro|bun|ponytail)\b/i;
const COLOURS =
  /\b(black|white|red|blue|navy|green|olive|yellow|mustard|orange|pink|purple|lilac|brown|beige|grey|gray|teal|maroon|burgundy|denim|striped|plaid|cream|golden|silver)\b/i;
const GARMENTS = /\b(jacket|hoodie|coat|cardigan|sweater|jumper|shirt|t-shirt|blouse|dress|abaya|galabeya|vest|blazer|uniform|scarf|apron|overalls)\b/;

function clauses(look: string): string[] {
  return look
    .toLowerCase()
    .replace(/[“”"]/g, "")
    .split(/[,.;]|\bwith\b|\band\b|\bover\b|\bunder\b/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/** The last `count` words before (and including) `word` in a clause, minus articles. */
function phraseEndingAt(clause: string, word: RegExp, count: number): string | null {
  const words = clause.split(/\s+/).filter((w) => !/^(a|an|the|his|her|their|usually|always)$/.test(w));
  const at = words.findIndex((w) => word.test(w));
  if (at === -1) return null;
  return words.slice(Math.max(0, at - count + 1), at + 1).join(" ");
}

function personNoun(look: string): string {
  const text = look.toLowerCase();
  const old = /\b(grand(mother|ma|father|pa)|teta|gedo|elderly|older|old)\b/.test(text);
  if (/\b(grandmother|grandma|woman|lady|mother|mum|mom|aunt)\b/.test(text)) return old ? "old woman" : "woman";
  if (/\b(grandfather|grandpa|man|father|dad|uncle|guy)\b/.test(text)) return old ? "old man" : "man";
  if (/\bgirl\b/.test(text)) return "girl";
  if (/\bboy\b/.test(text)) return "boy";
  if (/\b(child|kid|toddler|baby)\b/.test(text)) return "child";
  return old ? "old person" : "person";
}

/**
 * A short noun phrase SAM 3.1 can find: the kind of figure plus the single
 * most telling feature ("woman with curly dark hair", "old woman with lilac
 * headscarf", "orange tabby cat"). SAM reads one concept per request, and in
 * tests a second feature made it find nobody, so it gets one.
 */
export function nounPhrase(look: string, animal: boolean): string {
  const parts = clauses(look);
  if (animal) {
    const species = new RegExp(`^(${ANIMALS.join("|")})s?$`);
    for (const clause of parts) {
      const words = clause.split(/\s+/);
      const at = words.findIndex((w) => species.test(w));
      if (at === -1) continue;
      const before = words.slice(0, at).filter((w) => !ANIMAL_SKIP.has(w)).slice(-2);
      return [...before, words[at]].join(" ");
    }
    const kind = ANIMALS.find((name) => new RegExp(`\\b${name}`).test(look.toLowerCase()));
    return kind ?? "animal";
  }

  const noun = personNoun(look);
  const scarf = parts.map((c) => phraseEndingAt(c, /^(headscarf|hijab|headwrap|turban|cap|beanie|hat)$/, 2)).find(Boolean);
  if (scarf) return `${noun} with ${scarf}`;
  const hair = parts.map((c) => phraseEndingAt(c, /^hair$/, 3)).find((p) => p && HAIR_WORDS.test(p.replace(/ hair$/, "")));
  if (hair) return `${noun} with ${hair.replace(/^shoulder-length /, "")}`;
  const garment = parts.map((c) => phraseEndingAt(c, GARMENTS, 3)).find((p) => p && COLOURS.test(p));
  if (garment) return `${noun} in ${garment.replace(/^(oversized|baggy|loose|long|short) /, "")}`;
  const glasses = parts.map((c) => phraseEndingAt(c, /^glasses$/, 2)).find(Boolean);
  if (glasses) return `${noun} with ${glasses}`;
  const beard = parts.map((c) => phraseEndingAt(c, /^(beard|moustache|mustache)$/, 2)).find(Boolean);
  if (beard) return `${noun} with ${beard}`;
  return noun;
}

/* ---------- Detections ---------- */

export interface PixelBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * A 0/1 raster stretched over a detection's box. SAM sends masks at most
 * 1024 px on the long side, so a big figure's raster is smaller than its box.
 */
export interface Mask {
  data: Uint8Array;
  width: number;
  height: number;
}

/** Whether the mask covers box pixel (x, y), counted from the box's corner. */
export function maskAt(mask: Mask, box: PixelBox, x: number, y: number): boolean {
  const mx = Math.min(mask.width - 1, Math.floor((x * mask.width) / (box.x2 - box.x1)));
  const my = Math.min(mask.height - 1, Math.floor((y * mask.height) / (box.y2 - box.y1)));
  return mask.data[my * mask.width + mx] === 1;
}

/** One SAM detection, in pixels of the image sent. */
export interface Detection {
  box: PixelBox;
  score: number;
  /** The silhouette over `box`, when SAM sent one. */
  mask?: Mask;
}

/** What one SAM request was for: a character's phrase, or everyone ("person", "face"). */
export interface DetectionSet {
  /** The character the phrase describes; null for the sweeps. */
  characterId: string | null;
  /** "face" sweeps give heads, not figures. */
  faces?: boolean;
  animal: boolean;
  detections: Detection[];
}

export interface CastInPanel {
  characterId: string;
  animal: boolean;
}

/** A merged detection: one figure in the picture, with how well each phrase matched it. */
export interface Candidate {
  box: PixelBox;
  mask?: Mask;
  animal: boolean;
  /** Best score from each character's own phrase. */
  scores: Map<string, number>;
  /** Best score from the "person" sweep. */
  person: number;
}

const MIN_SCORE = 0.35;
const MAX_PER_SET = 20;
/** Detections smaller than this share of the image are noise for our purposes. */
const MIN_AREA = 0.004;

function area(b: PixelBox): number {
  return Math.max(0, b.x2 - b.x1) * Math.max(0, b.y2 - b.y1);
}

export function iou(a: PixelBox, b: PixelBox): number {
  const ix = Math.max(0, Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1));
  const iy = Math.max(0, Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1));
  const inter = ix * iy;
  const union = area(a) + area(b) - inter;
  return union > 0 ? inter / union : 0;
}

/** Merge every request's detections into figures (the same person found by two phrases is one figure). */
export function mergeDetections(sets: DetectionSet[], width: number, height: number): Candidate[] {
  const candidates: Candidate[] = [];
  for (const set of sets) {
    if (set.faces) continue;
    // A phrase can match a crowd; the best 20 per request are plenty for matching and lettering.
    for (const detection of [...set.detections].sort((a, b) => b.score - a.score).slice(0, MAX_PER_SET)) {
      if (detection.score < MIN_SCORE || area(detection.box) / (width * height) < MIN_AREA) continue;
      let match = candidates.find((c) => iou(c.box, detection.box) > 0.6);
      if (!match) {
        match = { box: detection.box, mask: detection.mask, animal: set.animal, scores: new Map(), person: 0 };
        candidates.push(match);
      }
      if (set.characterId) {
        match.scores.set(set.characterId, Math.max(match.scores.get(set.characterId) ?? 0, detection.score));
        if (set.animal) match.animal = true;
      } else {
        match.person = Math.max(match.person, detection.score);
      }
      if (!match.mask && detection.mask) match.mask = detection.mask;
    }
  }
  return candidates;
}

/** Most figures considered for matching, and most cast members (a panel never has more). */
export const MAX_MATCH_CANDIDATES = 12;
export const MAX_MATCH_CAST = 8;
const IMPROVE_ROUNDS = 20;

/**
 * How well a figure fits a cast member on its own, or null when it may not
 * be given to them: a character gets a figure its own phrase found, or (people
 * only) a plain "person" hit. A phrase hit the "person" sweep didn't see is
 * often a poster, a reflection or a coat on a chair, so it counts for less.
 */
function fit(member: CastInPanel, candidate: Candidate): number | null {
  const own = candidate.scores.get(member.characterId) ?? 0;
  if (member.animal) return own > 0 ? own : null;
  if (own > 0) return candidate.person > 0 ? own : own * 0.4;
  if (candidate.person <= 0) return null;
  return 0.2 + 0.1 * candidate.person;
}

/** Bonus for figures standing in the script's left-to-right order (characterIds order). */
function orderScore(assignment: (number | null)[], candidates: Candidate[]): number {
  let total = 0;
  for (let i = 0; i < assignment.length; i++) {
    for (let j = i + 1; j < assignment.length; j++) {
      const a = assignment[i];
      const b = assignment[j];
      if (a === null || b === null) continue;
      const ax = candidates[a].box.x1 + candidates[a].box.x2;
      const bx = candidates[b].box.x1 + candidates[b].box.x2;
      total += ax < bx ? 0.3 : -0.3;
    }
  }
  return total;
}

/**
 * Which figure is which cast member (index into `candidates`, or null when
 * none fits). Bounded work whatever SAM returns: at most 12 figures (best
 * scores first) and 8 cast members; a greedy best-score match, then a few
 * rounds of swaps and moves that keep any change raising the total, where
 * the total adds the left-to-right order bonus that settles two people found
 * by the same phrase.
 */
export function matchCast(cast: CastInPanel[], candidates: Candidate[]): (number | null)[] {
  const seen = new Set<string>();
  const members = cast.map((member, i) => ({ member, i })).filter(({ member }) => !seen.has(member.characterId) && seen.add(member.characterId)).slice(0, MAX_MATCH_CAST);
  const best = (candidate: Candidate) => Math.max(candidate.person, ...candidate.scores.values());
  const pool = candidates
    .map((candidate, c) => ({ candidate, c }))
    .sort((a, b) => best(b.candidate) - best(a.candidate))
    .slice(0, MAX_MATCH_CANDIDATES)
    .map(({ c }) => c);

  const fits = members.map(({ member }) => new Map(pool.flatMap((c) => {
    const value = fit(member, candidates[c]);
    return value === null ? [] : [[c, value] as const];
  })));
  const total = (assignment: (number | null)[]) =>
    assignment.reduce<number>((sum, c, k) => sum + (c === null ? 0 : fits[k].get(c)!), 0) + orderScore(assignment, candidates);

  // Greedy: the strongest (member, figure) pairs first.
  const assignment: (number | null)[] = members.map(() => null);
  const pairs = fits.flatMap((row, k) => [...row].map(([c, value]) => ({ k, c, value }))).sort((a, b) => b.value - a.value);
  const taken = new Set<number>();
  for (const { k, c } of pairs) {
    if (assignment[k] !== null || taken.has(c)) continue;
    assignment[k] = c;
    taken.add(c);
  }

  // Local improvement: swap two members' figures, or move one to a free figure (or to none).
  let score = total(assignment);
  for (let round = 0; round < IMPROVE_ROUNDS; round++) {
    let improved = false;
    for (let a = 0; a < members.length; a++) {
      for (let b = a + 1; b < members.length; b++) {
        const [ca, cb] = [assignment[a], assignment[b]];
        if ((cb !== null && !fits[a].has(cb)) || (ca !== null && !fits[b].has(ca))) continue;
        assignment[a] = cb;
        assignment[b] = ca;
        const next = total(assignment);
        if (next > score + 1e-9) {
          score = next;
          improved = true;
        } else {
          assignment[a] = ca;
          assignment[b] = cb;
        }
      }
      const current = assignment[a];
      for (const option of [null, ...fits[a].keys()]) {
        if (option === current || (option !== null && assignment.includes(option))) continue;
        assignment[a] = option;
        const next = total(assignment);
        if (next > score + 1e-9) {
          score = next;
          improved = true;
          break;
        }
        assignment[a] = current;
      }
    }
    if (!improved) break;
  }

  const result: (number | null)[] = cast.map(() => null);
  members.forEach(({ i }, k) => (result[i] = assignment[k]));
  return result;
}

/* ---------- Heads ---------- */

/**
 * The head of a figure, from its mask: the top of the silhouette, as wide as
 * the mask is across its first rows (down to 0.42 of the figure's width) and
 * 1.2 times as tall as that. Animals are kept whole (a cat's face can be anywhere in its box).
 */
export function headBox(box: PixelBox, mask: Mask | undefined, animal: boolean): PixelBox {
  if (animal) return box;
  const w = box.x2 - box.x1;
  const h = box.y2 - box.y1;
  if (!mask) {
    const headW = w * 0.6;
    return { x1: box.x1 + (w - headW) / 2, y1: box.y1, x2: box.x1 + (w + headW) / 2, y2: box.y1 + Math.min(h, headW * 1.2) };
  }
  // Work on the raster itself, then scale back to the box.
  const { data, width: mw, height: mh } = mask;
  let top = -1;
  for (let y = 0; y < mh && top === -1; y++) {
    for (let x = 0; x < mw; x++) {
      if (data[y * mw + x]) {
        top = y;
        break;
      }
    }
  }
  if (top === -1) return box;
  const sx = w / mw;
  const sy = h / mh;
  const sample = Math.max(4, Math.round((w * 0.42) / sy));
  let left = mw;
  let right = 0;
  for (let y = top; y < Math.min(mh, top + sample); y++) {
    for (let x = 0; x < mw; x++) {
      if (!data[y * mw + x]) continue;
      if (x < left) left = x;
      if (x > right) right = x;
    }
  }
  const headW = Math.max((right - left + 1) * sx, w * 0.25);
  const cx = ((left + right + 1) / 2) * sx;
  const x1 = Math.max(0, cx - headW * 0.55);
  const x2 = Math.min(w, cx + headW * 0.55);
  const y2 = Math.min(h, top * sy + headW * 1.2);
  return { x1: box.x1 + x1, y1: box.y1 + top * sy, x2: box.x1 + x2, y2: box.y1 + y2 };
}

function unit(b: PixelBox, width: number, height: number): UnitBox {
  const r = (v: number) => Math.round(v * 1000) / 1000;
  return { x: r(b.x1 / width), y: r(b.y1 / height), w: r((b.x2 - b.x1) / width), h: r((b.y2 - b.y1) / height) };
}

/** Everyone in the panel as stored on the Day: cast matches first, then other people. */
const MIN_FACE_SCORE = 0.5;

function contains(box: PixelBox, x: number, y: number): boolean {
  return x >= box.x1 && x <= box.x2 && y >= box.y1 && y <= box.y2;
}

/**
 * Everyone in the panel as stored on the Day: cast matches first, then other
 * people. A figure's head is the SAM "face" found inside it (the biggest),
 * else an estimate from its mask; a face inside no figure (a cat SAM saw only
 * as a face, a portrait on the wall) is kept as a figure of its own.
 */
export function toFigures(
  cast: CastInPanel[],
  candidates: Candidate[],
  matches: (number | null)[],
  width: number,
  height: number,
  faces: Detection[] = [],
): PanelFigures {
  const usable = faces.filter((face) => face.score >= MIN_FACE_SCORE && area(face.box) / (width * height) > 0.0004);
  const claimed = new Set<Detection>();
  const head = (candidate: Candidate, animal: boolean): PixelBox => {
    const inside = usable
      .filter((face) => !claimed.has(face) && contains(candidate.box, (face.box.x1 + face.box.x2) / 2, (face.box.y1 + face.box.y2) / 2))
      .sort((a, b) => area(b.box) - area(a.box));
    if (inside[0]) {
      claimed.add(inside[0]);
      return inside[0].box;
    }
    return headBox(candidate.box, candidate.mask, animal);
  };

  const items: PanelFigure[] = [];
  const used = new Set<number>();
  matches.forEach((c, i) => {
    if (c === null) return;
    used.add(c);
    const candidate = candidates[c];
    items.push({
      characterId: cast[i].characterId,
      kind: cast[i].animal ? "animal" : "person",
      box: unit(candidate.box, width, height),
      head: unit(head(candidate, cast[i].animal), width, height),
    });
  });
  candidates.forEach((candidate, c) => {
    // Anyone else any request found (a background person, a second "woman with glasses") is kept clear of lettering too.
    if (used.has(c)) return;
    items.push({
      kind: candidate.animal ? "animal" : "person",
      box: unit(candidate.box, width, height),
      head: unit(head(candidate, candidate.animal), width, height),
    });
  });
  for (const face of usable) {
    if (claimed.has(face)) continue;
    items.push({ kind: "person", box: unit(face.box, width, height), head: unit(face.box, width, height) });
  }
  return { aspect: Math.round((width / height) * 10_000) / 10_000, items: items.slice(0, 16) };
}
