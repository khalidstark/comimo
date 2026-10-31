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
 * The phone page reuses each panel's drawn aspect ratio (so nothing is
 * cropped): the splash runs edge to edge, small beats pair up side by side,
 * insets stay over the same corner of their hero, and the cuts between rows
 * lean more where the story turns.
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
const PHONE = { gutter: 0.28, margin: 0.24 };

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

interface PhoneRow {
  items: number[];
  /** Pre-gutter height in units. */
  height: number;
  /** For a narrowed single panel: its pre-gutter width and left edge. */
  width?: number;
  x?: number;
  bleed: boolean;
  /** Caption band above the art, in units (single-panel rows only). */
  band?: number;
}

/** FNV-1a, for deterministic choices from a seed. */
export function hashString(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const PAIR_MIN_WIDTH = 4.0;
const TRIO_MIN_WIDTH = 3.1;
const ROW_MIN_HEIGHT = 3.6;
/** A lone small panel on the phone page stays below this share of the splash's area. */
const SINGLE_MAX_SHARE = 0.55;
/** A panel's lettering may take this much of its art's height on the phone before it gets a caption band above the art. */
const BAND_TRIGGER = 0.4;
/** With a band, the art still holds this much of the lettering (the band the art was drawn to leave empty). */
const BAND_KEEP = 0.24;

function singleCost(aspect: number, focus: boolean): number {
  if (focus) return 0;
  return aspect >= 1.7 ? 0 : (1.7 - aspect) * 3 + 2;
}

const PHONE_UNIT_PX = PHONE_PAGE_PX / W;

/** True when a panel's caption and bubbles fit in the top 44% of a phone panel this size (units). */
function lettersFit(text: Lettering | undefined, width: number, height: number): boolean {
  if (!text || (!text.caption && text.lines.length === 0)) return true;
  const px = width * PHONE_UNIT_PX;
  return letteringHeight(text, px, px) <= 0.44 * height * PHONE_UNIT_PX;
}

/**
 * Cost of 2 or 3 small beats side by side; Infinity when one would be too
 * thin or the row too short. A panel whose lettering wouldn't fit makes the
 * row costly, so wordy panels get a row of their own on the phone.
 */
function rowCost(aspects: number[], texts: (Lettering | undefined)[]): number {
  const sum = aspects.reduce((a, b) => a + b, 0);
  const height = W / sum;
  const minWidth = aspects.length === 2 ? PAIR_MIN_WIDTH : TRIO_MIN_WIDTH;
  if ((Math.min(...aspects) / sum) * W < minWidth || height < ROW_MIN_HEIGHT) return Infinity;
  const crowded = aspects.filter((a, i) => !lettersFit(texts[i], (a / sum) * W, height)).length;
  return (aspects.length === 2 ? 0.4 + Math.abs(height - 6.5) * 0.15 : 1.2 + Math.abs(height - 5.5) * 0.15) + crowded * 5;
}

/** Split the panels (insets aside) into phone rows: the splash alone, small beats in pairs or threes. */
function planRows(order: number[], aspects: number[], focus: number, texts: (Lettering | undefined)[]): number[][] {
  const n = order.length;
  const cost = new Array<number>(n + 1).fill(Infinity);
  const choice = new Array<number>(n + 1).fill(1);
  cost[0] = 0;
  for (let i = 1; i <= n; i++) {
    const a = order[i - 1];
    cost[i] = cost[i - 1] + singleCost(aspects[a], a === focus);
    choice[i] = 1;
    for (const size of [2, 3]) {
      if (i < size) continue;
      const items = order.slice(i - size, i);
      if (items.includes(focus)) continue;
      const grouped = cost[i - size] + rowCost(items.map((item) => aspects[item]), items.map((item) => texts[item]));
      if (grouped < cost[i]) {
        cost[i] = grouped;
        choice[i] = size;
      }
    }
  }
  const rows: number[][] = [];
  for (let i = n; i > 0; i -= choice[i]) rows.unshift(order.slice(i - choice[i], i));
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
  // On a phone an inset would be too small to read over its hero, so it takes its place in the rows
  // like any other panel (alone, or paired with a neighbour), in reading order.
  const order = variant.slots.map((_, i) => i);
  const beatOf = (i: number) => metas.find((meta) => meta.index === i)?.beat;
  const g = PHONE.gutter;
  const m = PHONE.margin;

  // Rows and their heights, sized so each image keeps its aspect ratio after gutters.
  const texts = variant.slots.map((_, i): Lettering | undefined => {
    const meta = metas.find((m) => m.index === i);
    return meta ? { caption: meta.narration || meta.caption || undefined, lines: (meta.dialogue ?? []).map((line) => line.text) } : undefined;
  });
  const rows: PhoneRow[] = planRows(order, aspects, focus, texts).map((items) => {
    const bleed = items.includes(focus);
    const width = bleed ? W : W - 2 * m;
    if (items.length === 1) return { items, height: width / aspects[items[0]] + g, bleed };
    const sum = items.reduce((total, i) => total + aspects[i], 0);
    return { items, height: (width - g * (items.length - 1)) / sum + g, bleed };
  });

  // A lone small panel taller than the splash is narrowed and set to one side.
  const focusRow = rows.find((r) => r.items.includes(focus));
  const focusArea = focusRow ? W * focusRow.height : Infinity;
  let side = hashString(seed) & 1;
  for (const r of rows) {
    if (r.items.length !== 1 || r.bleed) continue;
    if ((W - 2 * m) * r.height <= SINGLE_MAX_SHARE * focusArea) continue;
    const a = aspects[r.items[0]];
    const w = Math.min(W - 2 * m, Math.sqrt(SINGLE_MAX_SHARE * focusArea * a));
    r.width = w + g;
    r.height = w / a + g;
    r.x = side ? W - m - r.width + g / 2 : m - g / 2;
    side ^= 1;
  }

  // Wordy panels alone in a row get a caption band above the art, so narration never has to sit on faces.
  for (const r of rows) {
    if (r.items.length !== 1) continue;
    const text = texts[r.items[0]];
    if (!text || (!text.caption && text.lines.length === 0)) continue;
    const width = (r.width ?? (r.bleed ? W : W - 2 * m)) - g;
    const art = width / aspects[r.items[0]];
    const need = letteringHeight(text, width * PHONE_UNIT_PX, width * PHONE_UNIT_PX) / PHONE_UNIT_PX;
    if (need <= BAND_TRIGGER * art) continue;
    r.band = need - BAND_KEEP * art;
    r.height += r.band;
  }

  // Edge margins: the first row's top and last row's bottom sit on the page margin.
  rows[0].height += m - g / 2;
  rows[rows.length - 1].height += m - g / 2;
  const height = rows.reduce((total, r) => total + r.height, 0);

  const placed: PlacedPanel[] = [];
  const sign = (k: number) => ((hashString(`${seed}:${k}`) & 1) === 0 ? 1 : -1);
  let top: Line = line([0, 0], [W, 0], "top");
  let y = 0;
  rows.forEach((r, k) => {
    y += r.height;
    const last = k === rows.length - 1;
    const next = rows[k + 1];
    const lean = last ? 0 : leanFor(beatOf(next.items[0]), next.items.includes(focus) || r.items.includes(focus));
    const rise = Math.tan((lean * Math.PI) / 180) * W * sign(k);
    const bottomLine: Line = last ? line([0, y], [W, y], "bottom") : line([0, y - rise / 2], [W, y + rise / 2]);

    const leftWall: Line = r.x !== undefined ? line([r.x, 0], [r.x, 1]) : line([0, 0], [0, 1], "left");
    const rightWall: Line =
      r.x !== undefined ? line([r.x + r.width!, 0], [r.x + r.width!, 1]) : line([W, 0], [W, 1], "right");
    const walls: Line[] = [leftWall];
    if (r.items.length > 1) {
      const width = r.bleed ? W : W - 2 * m;
      const sum = r.items.reduce((total, i) => total + aspects[i], 0);
      const art = width - g * (r.items.length - 1);
      let x = r.bleed ? 0 : m;
      const mid = y - r.height / 2;
      r.items.slice(0, -1).forEach((item, c) => {
        x += (art * aspects[item]) / sum + g / 2;
        const shift = Math.tan((4 * Math.PI) / 180) * (r.height / 2) * sign(k * 3 + c + 7);
        walls.push(line([x + shift, mid - r.height / 2], [x - shift, mid + r.height / 2]));
        x += g / 2;
      });
    }
    walls.push(rightWall);

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
