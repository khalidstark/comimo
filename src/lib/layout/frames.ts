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
}

function measure(geometry: PageGeometry, panel: PlacedPanel, pagePx: number): Measured {
  const unit = pagePx / geometry.width;
  const inset = geometry.panels.find((other) => other.inset && other.host === panel.index);
  const topCut = inset && inset.box.y - panel.box.y < panel.box.h * 0.3 ? inset.box.w * unit : 0;
  return { w: panel.box.w * unit, h: panel.box.h * unit, topCut };
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
  const top = Math.max(...sizes.map((s) => letteringHeight(text, s.w - s.topCut, s.w) / s.h));
  if (top <= 0.34 || aspect < 1.6) return { side: "top", size: Math.min(TOP_MAX + 0.08, Math.max(0.2, up(top))) };
  const side = covered?.endsWith("left") ? "right" : "left";
  // A side column must stay wide enough to read on the phone page.
  const size = SIDE_SIZES.find((share) =>
    sizes.every((s) => s.w * share >= SIDE_MIN_PX && letteringHeight(text, s.w * share, s.w) <= s.h * 0.94),
  );
  if (size === undefined || (top <= TOP_MAX && top <= size)) return { side: "top", size: Math.min(TOP_MAX + 0.08, up(top)) };
  return { side, size };
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
    return {
      aspect: aspects[i],
      zone: zoneFor(letteringOf(panel), sizes, aspects[i], covered),
      ...(covered ? { covered } : {}),
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
  if (zone.side === "top" || zone.side === "none") y1 = Math.max(y0 + 0.12, zone.size || 0.3);
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
