import { coverCrop, objectPosition, throughCrop, type CropWindow } from "@/lib/layout/crop";
import { letteringBox, panelFrames } from "@/lib/layout/frames";
import { boundingBox, innerRect, rectQuad, round, type Rect } from "@/lib/layout/geometry";
import { coveredCorner, desktopGeometry, phoneGeometry, type PageGeometry, type PlacedPanel } from "@/lib/layout/page";
import { normalizeStory, resolveLayout, type StoryPanel } from "@/lib/layout/pickLayout";
import type { LetteringZone, PageLayoutChoice, PanelFigures, PanelFrame, UnitBox } from "@/lib/types";

/**
 * A comic page ready to render: for every panel, CSS custom properties that
 * place it on the phone page (`--p-*`) and on the desktop page (`--d-*`).
 * comic-page.module.css switches between them with a container query, so
 * the page needs no measuring in JavaScript and renders on the server.
 */

export interface SlotView {
  index: number;
  inset: boolean;
  zone: LetteringZone;
  /** Which bottom corner the face-fix stamp sits in (away from any inset). */
  stamp: "left" | "right";
  /** Inline style: the panel's box, clip shape, lettering box and safe corners on both pages. */
  vars: Record<string, string>;
  /** The outline as SVG points in a 0 to 100 box, per page. */
  outline: { phone: string; desktop: string };
  /** The part of the drawn image each page shows (cover crop), as fractions of the image. */
  crop: { phone: CropWindow; desktop: CropWindow };
  /** Other panels laid over this one (a desktop inset), as fractions of this panel's box. */
  covers: { phone: UnitBox[]; desktop: UnitBox[] };
}

export interface PageView {
  /** Template id, for data attributes and checks. */
  template: string;
  vars: Record<string, string>;
  slots: SlotView[];
}

type LayoutPanel = StoryPanel & { frame?: PanelFrame; figures?: PanelFigures };

const pct = (value: number) => `${round(value * 100, 3)}%`;

/** The art's shape on a page: the panel's box below any caption band. */
function viewAspect(panel: PlacedPanel): number {
  return panel.box.w / (panel.box.h * (1 - (panel.band ?? 0)));
}

/** A lettering zone as it shows through a crop (old days letter into the zone the art left empty). */
function zoneThrough(zone: LetteringZone, crop: CropWindow): LetteringZone {
  if (zone.side === "top") return { side: "top", size: Math.min(0.6, Math.max(0, zone.size - crop.y) / crop.h) };
  if (zone.side === "left") return { side: "left", size: Math.min(0.6, Math.max(0, zone.size - crop.x) / crop.w) };
  if (zone.side === "right") return { side: "right", size: Math.min(0.6, Math.max(0, zone.size - (1 - crop.x - crop.w)) / crop.w) };
  return zone;
}

function boxVars(prefix: string, panel: PlacedPanel, geometry: PageGeometry, zone: LetteringZone, crop: CropWindow): Record<string, string> {
  const { box, inner, quad } = panel;
  const clip = quad.map(([x, y]) => `${pct((x - box.x) / box.w)} ${pct((y - box.y) / box.h)}`).join(", ");
  const letters: Rect = letteringBox(panel, zoneThrough(zone, crop), geometry);
  return {
    [`--${prefix}-x`]: pct(box.x / geometry.width),
    [`--${prefix}-y`]: pct(box.y / geometry.height),
    [`--${prefix}-w`]: pct(box.w / geometry.width),
    [`--${prefix}-h`]: pct(box.h / geometry.height),
    [`--${prefix}-clip`]: `polygon(${clip})`,
    [`--${prefix}-lx`]: pct(letters.x),
    [`--${prefix}-ly`]: pct(letters.y),
    [`--${prefix}-lw`]: pct(letters.w),
    [`--${prefix}-lh`]: pct(letters.h),
    [`--${prefix}-band`]: pct(panel.band ?? 0),
    [`--${prefix}-il`]: pct((inner.x - box.x) / box.w),
    [`--${prefix}-it`]: pct((inner.y - box.y) / box.h),
    [`--${prefix}-ir`]: pct((box.x + box.w - inner.x - inner.w) / box.w),
    [`--${prefix}-ib`]: pct((box.y + box.h - inner.y - inner.h) / box.h),
    [`--${prefix}-op`]: objectPosition(crop),
  };
}

/** Insets laid over a panel, as fractions of its box. */
function coversOf(geometry: PageGeometry, host: PlacedPanel): UnitBox[] {
  return geometry.panels
    .filter((other) => other.inset && other.host === host.index)
    .map((inset) => ({
      x: (inset.box.x - host.box.x) / host.box.w,
      y: (inset.box.y - host.box.y) / host.box.h,
      w: inset.box.w / host.box.w,
      h: inset.box.h / host.box.h,
    }));
}

function overlaps(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

/**
 * Desktop insets sit over a corner of their hero. When SAM found a face
 * under one, the inset moves to the hero's other corner on the same edge,
 * then the opposite edge, whichever covers the least face (it stays put
 * when no corner is better). Heads are padded so hair isn't clipped either.
 */
function moveInsets(desktop: PageGeometry, story: LayoutPanel[], aspects: (number | null)[]): PageGeometry {
  const panels = desktop.panels.map((panel) => {
    if (!panel.inset || panel.host === undefined) return panel;
    const hero = desktop.panels.find((p) => p.index === panel.host);
    const figures = story[panel.host]?.figures;
    if (!hero || !figures || figures.items.length === 0) return panel;
    const crop = coverCrop(aspects[panel.host] ?? figures.aspect, viewAspect(hero), figures);
    const heads = figures.items.map((item) => {
      const view = throughCrop(item.head, crop);
      const padX = view.w * 0.2;
      const padY = view.h * 0.15;
      return {
        x: hero.box.x + (view.x - padX) * hero.box.w,
        y: hero.box.y + (view.y - padY) * hero.box.h,
        w: (view.w + 2 * padX) * hero.box.w,
        h: (view.h + 2 * padY) * hero.box.h,
      };
    });
    const covered = (rect: Rect) => heads.reduce((sum, head) => sum + overlaps(rect, head), 0);
    const { box } = panel;
    const mirrorX = hero.box.x + hero.box.w - (box.x - hero.box.x) - box.w;
    const mirrorY = hero.box.y + hero.box.h - (box.y - hero.box.y) - box.h;
    const options: Rect[] = [box, { ...box, x: mirrorX }, { ...box, y: mirrorY }, { ...box, x: mirrorX, y: mirrorY }];
    const best = options.reduce((a, b) => (covered(b) < covered(a) - 1e-6 ? b : a));
    if (best === box) return panel;
    const quad = rectQuad(best);
    return { ...panel, quad, box: boundingBox(quad), inner: innerRect(quad) };
  });
  return { ...desktop, panels };
}

function outline(panel: PlacedPanel): string {
  const { box, quad } = panel;
  return quad.map(([x, y]) => `${round(((x - box.x) / box.w) * 100)},${round(((y - box.y) / box.h) * 100)}`).join(" ");
}

/**
 * Lay out one page of a comic. `choice` is the page's stored layout (or the
 * one picked for it on read); `seed` is the page's seed (see pageSeed), which
 * also seeds the phone page's slants. Panels drawn before layouts get their frame computed here.
 */
export function pageView(panels: LayoutPanel[], choice: PageLayoutChoice | null | undefined, seed: string): PageView {
  // One page of a comic: the layout engine numbers its panels from 0; slots keep the panels' own indexes.
  const sorted = [...panels].sort((a, b) => a.index - b.index);
  const story = normalizeStory(sorted.map((panel, index) => ({ ...panel, index })));
  const { template, variant } = resolveLayout(choice, story.length);
  const computed = story.every((panel) => panel.frame) ? null : panelFrames(choice ?? null, story, seed);
  // The drawn image's shape: what SAM measured, else the frame it was drawn for, else its slot's.
  const aspects = story.map((panel, i) => panel.figures?.aspect ?? panel.frame?.aspect ?? computed?.[i].aspect ?? null);
  const desktop = moveInsets(desktopGeometry(variant), story, aspects);
  const phone = phoneGeometry(variant, story, seed);

  const slots = story.map((panel, i): SlotView => {
    const zone = panel.frame?.zone ?? computed![i].zone;
    const onDesktop = desktop.panels.find((p) => p.index === i)!;
    const onPhone = phone.panels.find((p) => p.index === i)!;
    const covered = coveredCorner(desktop, i) ?? panel.frame?.covered ?? computed?.[i].covered;
    const aspect = aspects[i] ?? viewAspect(onDesktop);
    const crop = {
      phone: coverCrop(aspect, viewAspect(onPhone), panel.figures, zone),
      desktop: coverCrop(aspect, viewAspect(onDesktop), panel.figures, zone),
    };
    return {
      index: sorted[i].index,
      inset: onDesktop.inset,
      zone,
      stamp: covered === "bottom-right" ? "left" : "right",
      vars: {
        ...boxVars("p", onPhone, phone, zone, crop.phone),
        ...boxVars("d", onDesktop, desktop, zone, crop.desktop),
        "--z": onDesktop.inset ? "3" : "1",
      },
      outline: { phone: outline(onPhone), desktop: outline(onDesktop) },
      crop,
      covers: { phone: coversOf(phone, onPhone), desktop: coversOf(desktop, onDesktop) },
    };
  });

  return {
    template: template.id,
    vars: {
      "--p-ratio": `${phone.width} / ${round(phone.height, 3)}`,
      "--d-ratio": `${desktop.width} / ${round(desktop.height, 3)}`,
    },
    slots,
  };
}
