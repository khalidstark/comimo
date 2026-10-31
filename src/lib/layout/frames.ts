import type { Corner, LetteringZone, PageLayoutChoice, PanelFrame } from "../types";
import type { Rect } from "./geometry";
import { DESKTOP_PAGE_PX, PHONE_PAGE_PX, letteringHeight, type Lettering } from "./lettering";
import { coveredCorner, desktopGeometry, phoneGeometry, slotAspects, type PageGeometry, type PlacedPanel } from "./page";
import { letteringOf, normalizeStory, resolveLayout, type StoryPanel } from "./pickLayout";

/**
 * Lettering zones: before a panel is drawn, Comimo decides where its caption
 * and bubbles will sit and asks Muse Image to keep that part of the picture
 * as plain background. The zone is sized from the panel's own text, measured
 * on the smallest page it will be read on (a phone, and a narrow desktop
 * page), so the lettering never lands on a face.
 */

interface Measured {
  /** Panel width and height in px on a page of the nominal width. */
  w: number;
  h: number;
  /** Width lost to an inset over a top corner. */
  topCut: number;
  /** Height of a caption band above the art (phone pages); the art is `h` tall below it. */
  band: number;
}

function measure(geometry: PageGeometry, panel: PlacedPanel, pagePx: number): Measured {
  const unit = pagePx / geometry.width;
  const inset = geometry.panels.find((other) => other.inset && other.host === panel.index);
  const topCut = inset && inset.box.y - panel.box.y < panel.box.h * 0.3 ? inset.box.w * unit : 0;
  const band = (panel.band ?? 0) * panel.box.h * unit;
  return { w: panel.box.w * unit, h: panel.box.h * unit - band, topCut, band };
}

const TOP_MAX = 0.42;
const SIDE_SIZES = [0.36, 0.4, 0.45, 0.5];
const SIDE_MIN_PX = 130;

/** Round up to the next 0.02 so prompts say clean percentages. */
function up(value: number): number {
  return Math.ceil(value * 50) / 50;
}

/**
 * Where a panel's lettering goes. Top band for most panels; a side column for
 * wide strips (2:1 and wider) whose top band would be too thin to hold the text.
 */
export function zoneFor(text: Lettering, sizes: Measured[], aspect: number, covered?: Corner): LetteringZone {
  if (!text.caption && text.lines.length === 0) return { side: "none", size: 0 };
  // A caption band above the art takes what it can of the lettering; the art keeps room for the rest.
  const top = Math.max(...sizes.map((s) => Math.max(0, letteringHeight(text, s.w - s.topCut, s.w) - s.band) / s.h));
  if (top <= 0.34 || aspect < 1.6) return { side: "top", size: Math.min(TOP_MAX + 0.02, Math.max(0.2, up(top))) };
  const side = covered?.endsWith("left") ? "right" : "left";
  // A side column must stay wide enough to read on the phone page.
  const size = SIDE_SIZES.find((share) =>
    sizes.every((s) => s.w * share >= SIDE_MIN_PX && letteringHeight(text, s.w * share, s.w, true) <= s.h * 0.94),
  );
  if (size === undefined || (top <= TOP_MAX && top <= size)) return { side: "top", size: Math.min(TOP_MAX + 0.02, up(top)) };
  return { side, size };
}

/** Extra room around a covered corner, so a face near its edge isn't half hidden. */
const COVER_MARGIN = 0.06;

/** How much of a hero its inset covers (largest over both pages), as fractions of the hero's box. */
function coverageOf(geometries: PageGeometry[], host: number): { w: number; h: number; bottom: number } {
  let w = 0;
  let h = 0;
  let bottom = 0;
  for (const geometry of geometries) {
    const hero = geometry.panels.find((p) => p.index === host);
    const inset = geometry.panels.find((p) => p.inset && p.host === host);
    if (!hero || !inset) continue;
    w = Math.max(w, inset.box.w / hero.box.w);
    h = Math.max(h, inset.box.h / hero.box.h);
    bottom = Math.max(bottom, (inset.box.y + inset.box.h - hero.box.y) / hero.box.h);
  }
  return { w, h, bottom };
}

/**
 * The frame every panel is drawn for under a layout: drawn aspect ratio,
 * lettering zone and any corner an inset covers.
 */
export function panelFrames(choice: PageLayoutChoice | null, panels: StoryPanel[], seed: string): PanelFrame[] {
  const story = normalizeStory(panels);
  const { variant } = resolveLayout(choice, story.length);
  const desktop = desktopGeometry(variant);
  const phone = phoneGeometry(variant, story, seed);
  const aspects = slotAspects(variant);
  return story.map((panel, i) => {
    const covered = coveredCorner(desktop, i);
    const sizes = [desktop, phone].map((geometry, k) => {
      const placed = geometry.panels.find((p) => p.index === i)!;
      return measure(geometry, placed, k === 0 ? DESKTOP_PAGE_PX : PHONE_PAGE_PX);
    });
    let zone = zoneFor(letteringOf(panel), sizes, aspects[i], covered);
    const coverage = covered ? coverageOf([desktop, phone], i) : undefined;
    // An inset over a top corner sits inside the empty band, so no face can end up under it.
    if (coverage && covered?.startsWith("top") && (zone.side === "top" || zone.side === "none")) {
      zone = { side: "top", size: Math.min(TOP_MAX + 0.02, Math.max(zone.size, up(coverage.bottom + COVER_MARGIN))) };
    }
    return {
      aspect: aspects[i],
      zone,
      ...(covered && coverage ? { covered, coverage: { w: up(coverage.w + COVER_MARGIN), h: up(coverage.h + COVER_MARGIN) } } : {}),
    };
  });
}

/**
 * Where the lettering layer sits inside a panel's box, as fractions of the
 * box: the zone, trimmed to the part slanted edges don't cut, and moved
 * clear of an inset over a top corner.
 */
export function letteringBox(panel: PlacedPanel, zone: LetteringZone, geometry: PageGeometry): Rect {
  const { box, inner } = panel;
  const left = (inner.x - box.x) / box.w;
  const topEdge = (inner.y - box.y) / box.h;
  const right = (inner.x + inner.w - box.x) / box.w;
  const bottomEdge = (inner.y + inner.h - box.y) / box.h;
  let x0 = left;
  let x1 = right;
  const y0 = topEdge;
  let y1 = bottomEdge;
  const band = panel.band ?? 0;
  if (zone.side === "top" || zone.side === "none") y1 = Math.max(y0 + 0.12, band + (zone.size || 0.3) * (1 - band));
  if (zone.side === "left") x1 = Math.max(x0 + 0.2, zone.size);
  if (zone.side === "right") x0 = Math.min(x1 - 0.2, 1 - zone.size);

  const inset = geometry.panels.find((other) => other.inset && other.host === panel.index);
  if (inset && inset.box.y - box.y < box.h * 0.3) {
    const insetLeft = (inset.box.x - box.x) / box.w;
    const insetRight = (inset.box.x + inset.box.w - box.x) / box.w;
    if (insetLeft < 0.5) x0 = Math.max(x0, insetRight + 0.02);
    else x1 = Math.min(x1, insetLeft - 0.02);
  }
  return { x: x0, y: y0, w: Math.max(0.1, x1 - x0), h: Math.max(0.1, y1 - y0) };
}
