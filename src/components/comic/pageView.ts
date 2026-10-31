import { letteringBox, panelFrames } from "@/lib/layout/frames";
import { round, type Rect } from "@/lib/layout/geometry";
import { desktopGeometry, phoneGeometry, type PageGeometry, type PlacedPanel } from "@/lib/layout/page";
import { normalizeStory, resolveLayout, type StoryPanel } from "@/lib/layout/pickLayout";
import type { LetteringZone, PageLayoutChoice, PanelFrame } from "@/lib/types";

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
}

export interface PageView {
  /** Template id, for data attributes and checks. */
  template: string;
  vars: Record<string, string>;
  slots: SlotView[];
}

type LayoutPanel = StoryPanel & { frame?: PanelFrame };

const pct = (value: number) => `${round(value * 100, 3)}%`;

function boxVars(prefix: string, panel: PlacedPanel, geometry: PageGeometry, zone: LetteringZone): Record<string, string> {
  const { box, inner, quad } = panel;
  const clip = quad.map(([x, y]) => `${pct((x - box.x) / box.w)} ${pct((y - box.y) / box.h)}`).join(", ");
  const letters: Rect = letteringBox(panel, zone, geometry);
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
    [`--${prefix}-il`]: pct((inner.x - box.x) / box.w),
    [`--${prefix}-it`]: pct((inner.y - box.y) / box.h),
    [`--${prefix}-ir`]: pct((box.x + box.w - inner.x - inner.w) / box.w),
    [`--${prefix}-ib`]: pct((box.y + box.h - inner.y - inner.h) / box.h),
  };
}

function outline(panel: PlacedPanel): string {
  const { box, quad } = panel;
  return quad.map(([x, y]) => `${round(((x - box.x) / box.w) * 100)},${round(((y - box.y) / box.h) * 100)}`).join(" ");
}

/**
 * Lay out a comic's panels. `choice` is the day's stored layout (or the one
 * picked for it on read); `seed` is the day id, which also seeds the phone
 * page's slants. Panels drawn before layouts get their frame computed here.
 */
export function pageView(panels: LayoutPanel[], choice: PageLayoutChoice | null | undefined, seed: string): PageView {
  const story = normalizeStory([...panels].sort((a, b) => a.index - b.index));
  const { template, variant } = resolveLayout(choice, story.length);
  const desktop = desktopGeometry(variant);
  const phone = phoneGeometry(variant, story, seed);
  const computed = story.every((panel) => panel.frame) ? null : panelFrames(choice ?? null, story, seed);

  const slots = story.map((panel, i): SlotView => {
    const zone = panel.frame?.zone ?? computed![i].zone;
    const onDesktop = desktop.panels.find((p) => p.index === i)!;
    const onPhone = phone.panels.find((p) => p.index === i)!;
    const covered = panel.frame?.covered ?? computed?.[i].covered;
    return {
      index: panel.index,
      inset: onDesktop.inset,
      zone,
      stamp: covered === "bottom-right" ? "left" : "right",
      vars: {
        ...boxVars("p", onPhone, phone, zone),
        ...boxVars("d", onDesktop, desktop, zone),
        "--z": onDesktop.inset ? "3" : "1",
      },
      outline: { phone: outline(onPhone), desktop: outline(onDesktop) },
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
