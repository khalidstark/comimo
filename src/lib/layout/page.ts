import type { Beat, Corner, Shot } from "../types";
import {
  boundingBox,
  cellQuad,
  innerRect,
  insetQuad,
  line,
  quadArea,
  rectQuad,
  type EdgeValues,
  type Line,
  type PageEdge,
  type Quad,
  type Rect,
} from "./geometry";
import { PHONE_PAGE_PX, letteringHeight, type Lettering } from "./lettering";
import { PAGE_WIDTH as W, type CellSlot, type TemplateVariant } from "./templates";

/**
 * Turns a template variant into panel shapes on a page, twice: the designed
 * desktop page, and a phone page that keeps its rhythm in one column.
 *
 * The phone page fills the width with rows of one panel or a pair (each
 * image cropped with cover around its characters, see crop.ts): the splash
 * runs edge to edge and tall, insets take a place in the rows, and the cuts
 * between rows lean more where the story turns.
 */

/** What the layout needs to know about a panel. */
export interface PanelMeta {
  index: number;
  shot?: Shot;
  beat?: Beat;
  caption?: string;
  narration?: string;
  dialogue?: readonly { text: string }[];
}

export interface PlacedPanel {
  index: number;
  /** The panel's shape after gutters, in page units. */
  quad: Quad;
  /** Its bounding box: where the art image sits. */
  box: Rect;
  /** The part no slanted edge cuts: lettering and stamps go here. */
  inner: Rect;
  inset: boolean;
  /** For an inset: the panel it overlaps. */
  host?: number;
  /**
   * Phone pages only: a caption band above the art, as a share of the box's
   * height, for a panel whose lettering needs more room than its art left
   * empty. The art keeps its aspect below the band (like a graphic novel's
   * caption on the dark page above a picture).
   */
  band?: number;
}

export interface PageGeometry {
  width: number;
  height: number;
  panels: PlacedPanel[];
}

/** Gutters and page margins in units (the page is 12 units wide). */
const DESKTOP = { gutter: 0.16, margin: 0.24 };
const PHONE = { gutter: 0.14, margin: 0.14 };

/* ---------- Aspect ratios Muse Image is asked for ---------- */

/**
 * Muse Image takes any `size` up to 16:1 and only uses it for the aspect
 * ratio; panels are drawn at the nearest of these common ratios.
 */
export const DRAW_SIZES: readonly { aspect: number; size: string }[] = [
  { aspect: 1 / 2, size: "768x1536" },
  { aspect: 9 / 16, size: "864x1536" },
  { aspect: 2 / 3, size: "1024x1536" },
  { aspect: 3 / 4, size: "1152x1536" },
  { aspect: 4 / 5, size: "1024x1280" },
  { aspect: 1, size: "1024x1024" },
  { aspect: 5 / 4, size: "1280x1024" },
  { aspect: 4 / 3, size: "1536x1152" },
  { aspect: 3 / 2, size: "1536x1024" },
  { aspect: 16 / 9, size: "1536x864" },
  { aspect: 2, size: "2048x1024" },
  { aspect: 7 / 3, size: "1792x768" },
  { aspect: 5 / 2, size: "1920x768" },
  { aspect: 3, size: "1536x512" },
  { aspect: 7 / 2, size: "1792x512" },
];

/** The drawable aspect ratio nearest to a slot's. */
export function snapAspect(aspect: number): number {
  let best = DRAW_SIZES[0];
  for (const option of DRAW_SIZES) {
    if (Math.abs(Math.log(option.aspect / aspect)) < Math.abs(Math.log(best.aspect / aspect))) best = option;
  }
  return Math.round(best.aspect * 10_000) / 10_000;
}

/** The Muse Image `size` for a drawn aspect ratio. */
export function drawSize(aspect: number): string {
  const snapped = snapAspect(aspect);
  return DRAW_SIZES.find((option) => Math.abs(option.aspect - snapped) < 1e-3)?.size ?? "1536x1024";
}

/* ---------- Desktop ---------- */

function edgeDistances(slot: CellSlot, sizes: { gutter: number; margin: number }): EdgeValues {
  const bleed = new Set(slot.bleed ?? []);
  const lines = [slot.top, slot.right, slot.bottom, slot.left];
  return lines.map((l) => (l.edge ? (bleed.has(l.edge) ? 0 : sizes.margin) : sizes.gutter / 2)) as unknown as EdgeValues;
}

function place(index: number, quad: Quad, inset: boolean, host?: number): PlacedPanel {
  return { index, quad, box: boundingBox(quad), inner: innerRect(quad), inset, ...(host !== undefined ? { host } : {}) };
}

export function desktopGeometry(variant: TemplateVariant): PageGeometry {
  const panels = variant.slots.map((slot, index) => {
    if (slot.kind === "inset") return place(index, rectQuad(slot.rect), true, slot.host);
    const quad = insetQuad(cellQuad(slot.top, slot.right, slot.bottom, slot.left), edgeDistances(slot, DESKTOP));
    return place(index, quad, false);
  });
  return { width: W, height: variant.height, panels };
}

/** Each panel's drawn aspect ratio, from its desktop slot. */
export function slotAspects(variant: TemplateVariant): number[] {
  return desktopGeometry(variant).panels.map((panel) => snapAspect(panel.box.w / panel.box.h));
}

/* ---------- Phone ---------- */

/** FNV-1a, for deterministic choices from a seed. */
export function hashString(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Phone pages fill the width: every row is one panel across the page or a
 * pair side by side. The rhythm comes from heights (a tall splash, short
 * strips) and slanted cuts, never from narrowing a panel. Each image is shown
 * with object-fit: cover at a height between 0.55 and 1.3 of its width, the
 * crop centred on the characters (see crop.ts).
 */
interface PhoneRow {
  items: number[];
  /** Art height in units (below any caption band). */
  height: number;
  /** Width share of each item (pairs). */
  shares: number[];
  bleed: boolean;
  /** Caption band above the art, in units (single-panel rows only). */
  band?: number;
}

/** Shown height over width, for any phone panel. */
export const PHONE_RATIO = { min: 0.55, max: 1.3 } as const;
/** The splash is never shorter than this (height over width): tall and dominant. */
const FOCUS_MIN_RATIO = 0.85;
/** In a pair, neither panel is narrower than this share of the row. */
const PAIR_SHARE = { min: 0.4, max: 0.6 } as const;
/** A panel's lettering may take this much of its art's height on the phone before it gets a caption band above the art. */
const BAND_TRIGGER = 0.4;
/** With a band, the art still holds this much of the lettering (the band the art was drawn to leave empty). */
const BAND_KEEP = 0.24;

const PHONE_UNIT_PX = PHONE_PAGE_PX / W;

function clampRatio(value: number, min: number = PHONE_RATIO.min, max: number = PHONE_RATIO.max): number {
  return Math.min(max, Math.max(min, value));
}

/** How much of a drawn image a shown shape crops away (0 when it matches). */
function cropLoss(drawn: number, shown: number): number {
  return Math.abs(Math.log(shown / drawn));
}

/** True when a panel's caption and bubbles fit in the top 44% of a phone panel this size (units). */
function lettersFit(text: Lettering | undefined, width: number, height: number): boolean {
  if (!text || (!text.caption && text.lines.length === 0)) return true;
  const px = width * PHONE_UNIT_PX;
  return letteringHeight(text, px, px) <= 0.44 * height * PHONE_UNIT_PX;
}

/** A pair row's widths (shares of the row) and art height, for two drawn aspects. */
function pairShape(a: number, b: number, rowWidth: number): { shares: number[]; height: number } {
  const first = Math.min(PAIR_SHARE.max, Math.max(PAIR_SHARE.min, a / (a + b)));
  const shares = [first, 1 - first];
  const art = rowWidth - PHONE.gutter;
  const widths = shares.map((share) => share * art);
  const natural = art / (a + b);
  const low = Math.max(...widths) * PHONE_RATIO.min;
  const high = Math.min(...widths) * PHONE_RATIO.max;
  return { shares, height: Math.min(high, Math.max(low, natural)) };
}

/** Split the panels (insets included, in reading order) into phone rows: one across, or a pair. */
function planRows(order: number[], aspects: number[], focus: number, texts: (Lettering | undefined)[]): number[][] {
  const rowWidth = W - 2 * PHONE.margin;
  const singleCost = (i: number) => {
    if (i === focus) return 0;
    const shown = 1 / clampRatio(1 / aspects[i]);
    return 1 + cropLoss(aspects[i], shown) * 0.8;
  };
  const pairCost = (i: number, j: number) => {
    if (i === focus || j === focus) return Infinity;
    const { shares, height } = pairShape(aspects[i], aspects[j], rowWidth);
    const widths = shares.map((share) => share * (rowWidth - PHONE.gutter));
    // Wordy panels get a row of their own, so their lettering has room.
    if (!lettersFit(texts[i], widths[0], height) || !lettersFit(texts[j], widths[1], height)) return Infinity;
    return 0.5 + (cropLoss(aspects[i], widths[0] / height) + cropLoss(aspects[j], widths[1] / height)) * 0.8;
  };
  const n = order.length;
  const cost = new Array<number>(n + 1).fill(Infinity);
  const choice = new Array<number>(n + 1).fill(1);
  cost[0] = 0;
  for (let k = 1; k <= n; k++) {
    cost[k] = cost[k - 1] + singleCost(order[k - 1]);
    choice[k] = 1;
    if (k >= 2) {
      const paired = cost[k - 2] + pairCost(order[k - 2], order[k - 1]);
      if (paired < cost[k]) {
        cost[k] = paired;
        choice[k] = 2;
      }
    }
  }
  const rows: number[][] = [];
  for (let k = n; k > 0; k -= choice[k]) rows.unshift(order.slice(k - choice[k], k));
  return rows;
}

/** How far the cut above a row leans, in degrees, from the story beat it opens. */
function leanFor(beat: Beat | undefined, focusRow: boolean): number {
  if (focusRow) return 5.5;
  switch (beat) {
    case "turn":
    case "climax":
      return 6.5;
    case "build":
      return 3.5;
    default:
      return 0;
  }
}

export function phoneGeometry(variant: TemplateVariant, metas: PanelMeta[], seed: string): PageGeometry {
  const aspects = slotAspects(variant);
  const { focus } = variant;
  // On a phone an inset would be too small to read over its hero, so it takes its place in the rows, in reading order.
  const order = variant.slots.map((_, i) => i);
  const beatOf = (i: number) => metas.find((meta) => meta.index === i)?.beat;
  const g = PHONE.gutter;
  const m = PHONE.margin;

  const texts = variant.slots.map((_, i): Lettering | undefined => {
    const meta = metas.find((m) => m.index === i);
    return meta ? { caption: meta.narration || meta.caption || undefined, lines: (meta.dialogue ?? []).map((line) => line.text) } : undefined;
  });

  const focusRatio = clampRatio(1 / aspects[focus], FOCUS_MIN_RATIO);
  const rows: PhoneRow[] = planRows(order, aspects, focus, texts).map((items) => {
    const bleed = items.includes(focus);
    const width = bleed ? W : W - 2 * m;
    if (items.length === 1) {
      // Other single panels stay clearly smaller than the splash.
      const ratio = bleed ? focusRatio : clampRatio(1 / aspects[items[0]], PHONE_RATIO.min, Math.max(PHONE_RATIO.min, Math.min(PHONE_RATIO.max, focusRatio / 1.35)));
      return { items, height: (width - g) * ratio, shares: [1], bleed };
    }
    const { shares, height } = pairShape(aspects[items[0]], aspects[items[1]], width);
    return { items, height, shares, bleed };
  });

  // Wordy panels alone in a row get a caption band above the art, so narration never has to sit on faces.
  for (const r of rows) {
    if (r.items.length !== 1) continue;
    const text = texts[r.items[0]];
    if (!text || (!text.caption && text.lines.length === 0)) continue;
    const width = (r.bleed ? W : W - 2 * m) - g;
    const need = letteringHeight(text, width * PHONE_UNIT_PX, width * PHONE_UNIT_PX) / PHONE_UNIT_PX;
    if (need <= BAND_TRIGGER * r.height) continue;
    r.band = need - BAND_KEEP * r.height;
  }

  // Row heights on the page: art, band and a gutter; the first and last rows sit on the page margin.
  const heights = rows.map((r, k) => r.height + (r.band ?? 0) + g + (k === 0 ? m - g / 2 : 0) + (k === rows.length - 1 ? m - g / 2 : 0));
  const height = heights.reduce((total, h) => total + h, 0);

  const placed: PlacedPanel[] = [];
  const sign = (k: number) => ((hashString(`${seed}:${k}`) & 1) === 0 ? 1 : -1);
  let top: Line = line([0, 0], [W, 0], "top");
  let y = 0;
  rows.forEach((r, k) => {
    y += heights[k];
    const rowHeight = r.height + (r.band ?? 0);
    const last = k === rows.length - 1;
    const next = rows[k + 1];
    const lean = last ? 0 : leanFor(beatOf(next.items[0]), next.items.includes(focus) || r.items.includes(focus));
    // A slant never eats more than a fifth of the shorter row's height.
    const limit = last ? 0 : Math.min(rowHeight, next.height + (next.band ?? 0)) * 0.2;
    const rise = Math.max(-limit, Math.min(limit, Math.tan((lean * Math.PI) / 180) * W)) * sign(k);
    const bottomLine: Line = last ? line([0, y], [W, y], "bottom") : line([0, y - rise / 2], [W, y + rise / 2]);

    const walls: Line[] = [line([0, 0], [0, 1], "left")];
    if (r.items.length === 2) {
      const width = r.bleed ? W : W - 2 * m;
      const x = (r.bleed ? 0 : m) + r.shares[0] * (width - g) + g / 2;
      const mid = y - heights[k] / 2;
      const shift = Math.tan((4 * Math.PI) / 180) * (rowHeight / 2) * sign(k * 3 + 7);
      walls.push(line([x + shift, mid - rowHeight / 2], [x - shift, mid + rowHeight / 2]));
    }
    walls.push(line([W, 0], [W, 1], "right"));

    r.items.forEach((index, i) => {
      const raw: Quad = cellQuad(top, walls[i + 1], bottomLine, walls[i]);
      const edges: (PageEdge | undefined)[] = [top.edge, walls[i + 1].edge, bottomLine.edge, walls[i].edge];
      const distances = edges.map((edge) =>
        edge === "left" || edge === "right" ? (r.bleed ? 0 : m) : edge ? m : g / 2,
      ) as unknown as EdgeValues;
      const panel = place(index, insetQuad(raw, distances), false);
      if (r.band) panel.band = Math.min(0.6, r.band / panel.box.h);
      placed.push(panel);
    });
    top = bottomLine;
  });

  placed.sort((a, b) => a.index - b.index);
  return { width: W, height, panels: placed };
}

/* ---------- Shared helpers ---------- */

/** The corner of a hero an inset covers. */
export function coveredCorner(geometry: PageGeometry, host: number): Corner | undefined {
  const inset = geometry.panels.find((panel) => panel.inset && panel.host === host);
  const hero = geometry.panels.find((panel) => panel.index === host);
  if (!inset || !hero) return undefined;
  const right = inset.box.x + inset.box.w / 2 > hero.box.x + hero.box.w / 2;
  const lower = inset.box.y + inset.box.h / 2 > hero.box.y + hero.box.h / 2;
  return `${lower ? "bottom" : "top"}-${right ? "right" : "left"}`;
}

/** Areas of the panels in a geometry, by panel index. */
export function panelAreas(geometry: PageGeometry): number[] {
  return [...geometry.panels].sort((a, b) => a.index - b.index).map((panel) => quadArea(panel.quad));
}
