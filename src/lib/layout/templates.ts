import type { Shot } from "../types";
import { line, type Line, type PageEdge, type Rect } from "./geometry";

/**
 * Hand-designed comic page templates for 4, 5 and 6 panels.
 *
 * A page is 12 units wide (a 12-column grid) and as tall as the template
 * says. Panels are cut out of it by gutter lines that may lean 3 to 8
 * degrees; insets sit over a corner of a bigger panel; bleed slots run off
 * the page edge. Slots are listed in reading order, so slot i holds panel i.
 *
 * Each template has variants, one per `focus`: the panel index that gets the
 * page's dominant slot (the splash). Variants keep the template's character
 * (an opening vista, a tall column, an inset over a hero panel...) and move
 * the hero band to where the story peaks. Every (count, focus) pair is
 * covered by at least two templates, so two days in a row never need the
 * same one.
 */

export const PAGE_WIDTH = 12;

/** A panel cut from the page by four lines. */
export interface CellSlot {
  kind: "cell";
  top: Line;
  right: Line;
  bottom: Line;
  left: Line;
  /** Shots this slot frames well. */
  suits: readonly Shot[];
  /** Page edges the art runs off instead of stopping at the margin. */
  bleed?: readonly PageEdge[];
}

/** A smaller panel laid over a corner of a bigger one (its host). */
export interface InsetSlot {
  kind: "inset";
  rect: Rect;
  /** Slot index of the panel it overlaps. */
  host: number;
  suits: readonly Shot[];
}

export type Slot = CellSlot | InsetSlot;

export interface TemplateVariant {
  /** The panel index in the dominant slot. */
  focus: number;
  /** Page height in units (width is 12). */
  height: number;
  slots: readonly Slot[];
}

export interface PageTemplate {
  id: string;
  name: string;
  count: 4 | 5 | 6;
  variants: readonly TemplateVariant[];
}

/* ---------- Drawing kit ---------- */

const W = PAGE_WIDTH;
const TOP = line([0, 0], [W, 0], "top");
const LEFT = line([0, 0], [0, 1], "left");
const RIGHT = line([W, 0], [W, 1], "right");
const bottom = (height: number) => line([0, height], [W, height], "bottom");
/** A gutter across the page: y where it meets the left edge, y at the right edge. */
const H = (yLeft: number, yRight: number) => line([0, yLeft], [W, yRight]);
/** A gutter down the page through (xTop, yTop) and (xBottom, yBottom). */
const V = (xTop: number, xBottom: number, yTop: number, yBottom: number) => line([xTop, yTop], [xBottom, yBottom]);

const cell = (top: Line, right: Line, bottomLine: Line, left: Line, suits: readonly Shot[], bleed?: readonly PageEdge[]): CellSlot => ({
  kind: "cell",
  top,
  right,
  bottom: bottomLine,
  left,
  suits,
  ...(bleed ? { bleed } : {}),
});

const inset = (x: number, y: number, w: number, h: number, host: number, suits: readonly Shot[] = INSET): InsetSlot => ({
  kind: "inset",
  rect: { x, y, w, h },
  host,
  suits,
});

/** Cells side by side between two gutters, split by vertical cuts. */
function row(top: Line, bottomLine: Line, cuts: Line[], suits: readonly (readonly Shot[])[], bleed: readonly PageEdge[] = []): CellSlot[] {
  const walls = [LEFT, ...cuts, RIGHT];
  return suits.map((shots, i) => {
    const edges = bleed.filter((edge) => (edge === "left" ? i === 0 : edge === "right" ? i === suits.length - 1 : true));
    return cell(top, walls[i + 1], bottomLine, walls[i], shots, edges.length ? edges : undefined);
  });
}

/** Cells stacked between two walls, split by horizontal cuts (first and last are the top and bottom). */
function column(left: Line, right: Line, cuts: Line[], suits: readonly (readonly Shot[])[]): CellSlot[] {
  return suits.map((shots, i) => cell(cuts[i], right, cuts[i + 1], left, shots));
}

/* ---------- What each slot frames well ---------- */

const HERO: readonly Shot[] = ["splash", "establishing", "wide"];
const STRIP: readonly Shot[] = ["establishing", "wide", "detail"];
const MEDIUM: readonly Shot[] = ["medium", "wide", "establishing"];
const CLOSE: readonly Shot[] = ["closeup", "medium", "detail"];
const NARROW: readonly Shot[] = ["closeup", "detail"];
const INSET: readonly Shot[] = ["closeup", "detail"];

/* ---------- 4 panels ---------- */

const vista4: PageTemplate = {
  id: "vista-4",
  name: "Opening vista",
  count: 4,
  variants: [
    {
      // A big establishing splash, then three beats underneath.
      focus: 0,
      height: 14.4,
      slots: [
        cell(TOP, RIGHT, H(9.0, 8.2), LEFT, HERO, ["top", "left", "right"]),
        ...row(H(9.0, 8.2), bottom(14.4), [V(4.7, 4.3, 8.6, 14.4), V(8.3, 8.7, 8.6, 14.4)], [MEDIUM, NARROW, CLOSE]),
      ],
    },
    {
      // Three quick beats, then the payoff fills the rest of the page.
      focus: 3,
      height: 15.4,
      slots: [
        ...row(TOP, H(4.7, 5.4), [V(4.9, 4.5, 0, 5), V(8.2, 8.6, 0, 5)], [MEDIUM, NARROW, CLOSE]),
        cell(H(4.7, 5.4), RIGHT, bottom(15.4), LEFT, HERO, ["left", "right", "bottom"]),
      ],
    },
  ],
};

const turn4: PageTemplate = {
  id: "turn-4",
  name: "The turn",
  count: 4,
  variants: [
    {
      // Strip, the big moment across the page, then a quick pair.
      focus: 1,
      height: 15.6,
      slots: [
        cell(TOP, RIGHT, H(3.9, 4.6), LEFT, STRIP, ["top"]),
        cell(H(3.9, 4.6), RIGHT, H(12.0, 11.2), LEFT, HERO, ["left", "right"]),
        ...row(H(12.0, 11.2), bottom(15.6), [V(7.1, 6.6, 11.6, 15.6)], [MEDIUM, CLOSE]),
      ],
    },
    {
      // A pair builds up, the turn takes the page, a closing strip.
      focus: 2,
      height: 15.6,
      slots: [
        ...row(TOP, H(4.6, 4.0), [V(5.0, 5.5, 0, 4.3)], [CLOSE, MEDIUM]),
        cell(H(4.6, 4.0), RIGHT, H(12.0, 12.6), LEFT, HERO, ["left", "right"]),
        cell(H(12.0, 12.6), RIGHT, bottom(15.6), LEFT, STRIP, ["bottom"]),
      ],
    },
  ],
};

const inset4: PageTemplate = {
  id: "inset-4",
  name: "Hero with an inset",
  count: 4,
  variants: [
    {
      // The big moment, then a reaction close-up laid over its corner.
      focus: 2,
      height: 16,
      slots: [
        ...row(TOP, H(5.0, 4.4), [V(5.6, 6.1, 0, 4.7)], [MEDIUM, CLOSE]),
        cell(H(5.0, 4.4), RIGHT, bottom(16), LEFT, HERO, ["left", "right", "bottom"]),
        inset(7.1, 11.6, 4.4, 4.0, 2),
      ],
    },
    {
      // A close-up leads into the payoff it sits on.
      focus: 3,
      height: 16,
      slots: [
        ...row(TOP, H(5.2, 4.6), [V(7.2, 6.8, 0, 4.9)], [MEDIUM, CLOSE]),
        inset(0.5, 5.6, 4.6, 3.9, 3),
        cell(H(5.2, 4.6), RIGHT, bottom(16), LEFT, HERO, ["left", "right", "bottom"]),
      ],
    },
  ],
};

const column4: PageTemplate = {
  id: "column-4",
  name: "Tall column",
  count: 4,
  variants: [
    {
      // A tall opening panel with two beats stacked beside it, then a strip.
      focus: 0,
      height: 14.6,
      slots: [
        cell(TOP, V(7.8, 7.1, 0, 10.4), H(10.8, 10.0), LEFT, HERO, ["top", "left"]),
        ...column(V(7.8, 7.1, 0, 10.4), RIGHT, [TOP, H(5.4, 4.8), H(10.8, 10.0)], [CLOSE, MEDIUM]),
        cell(H(10.8, 10.0), RIGHT, bottom(14.6), LEFT, STRIP, ["bottom"]),
      ],
    },
    {
      // A strip sets the scene, then a tall panel with two beats beside it.
      focus: 1,
      height: 15.6,
      slots: [
        cell(TOP, RIGHT, H(3.8, 4.4), LEFT, STRIP, ["top"]),
        cell(H(3.8, 4.4), V(7.4, 8.1, 4.1, 15.6), bottom(15.6), LEFT, HERO, ["left", "bottom"]),
        ...column(V(7.4, 8.1, 4.1, 15.6), RIGHT, [H(3.8, 4.4), H(9.6, 10.2), bottom(15.6)], [CLOSE, MEDIUM]),
      ],
    },
  ],
};

/* ---------- 5 panels ---------- */

const vista5: PageTemplate = {
  id: "vista-5",
  name: "Opening vista",
  count: 5,
  variants: [
    {
      focus: 0,
      height: 17.4,
      slots: [
        cell(TOP, RIGHT, H(8.4, 7.6), LEFT, HERO, ["top", "left", "right"]),
        ...row(H(8.4, 7.6), H(12.8, 13.4), [V(6.8, 6.3, 8, 13.1)], [MEDIUM, CLOSE]),
        ...row(H(12.8, 13.4), bottom(17.4), [V(4.6, 5.0, 13.1, 17.4)], [NARROW, MEDIUM]),
      ],
    },
    {
      focus: 4,
      height: 17.6,
      slots: [
        ...row(TOP, H(4.6, 4.0), [V(4.4, 4.9, 0, 4.3)], [CLOSE, MEDIUM]),
        ...row(H(4.6, 4.0), H(8.6, 9.3), [V(7.6, 7.1, 4.3, 9)], [MEDIUM, CLOSE]),
        cell(H(8.6, 9.3), RIGHT, bottom(17.6), LEFT, HERO, ["left", "right", "bottom"]),
      ],
    },
  ],
};

const turn5: PageTemplate = {
  id: "turn-5",
  name: "The turn",
  count: 5,
  variants: [
    {
      focus: 1,
      height: 16,
      slots: [
        cell(TOP, RIGHT, H(3.6, 4.2), LEFT, STRIP, ["top"]),
        cell(H(3.6, 4.2), RIGHT, H(11.6, 11.0), LEFT, HERO, ["left", "right"]),
        ...row(H(11.6, 11.0), bottom(16), [V(4.2, 3.8, 11.3, 16), V(8.1, 8.5, 11.3, 16)], [MEDIUM, NARROW, CLOSE]),
      ],
    },
    {
      focus: 2,
      height: 17.2,
      slots: [
        ...row(TOP, H(4.8, 4.2), [V(6.6, 7.1, 0, 4.5)], [MEDIUM, CLOSE]),
        cell(H(4.8, 4.2), RIGHT, H(12.4, 11.8), LEFT, HERO, ["left", "right"]),
        ...row(H(12.4, 11.8), bottom(17.2), [V(5.2, 4.7, 12.1, 17.2)], [CLOSE, MEDIUM]),
      ],
    },
  ],
};

const inset5: PageTemplate = {
  id: "inset-5",
  name: "Hero with an inset",
  count: 5,
  variants: [
    {
      focus: 2,
      height: 17.6,
      slots: [
        ...row(TOP, H(4.4, 5.0), [V(5.4, 5.0, 0, 4.7)], [CLOSE, MEDIUM]),
        cell(H(4.4, 5.0), RIGHT, H(13.8, 13.2), LEFT, HERO, ["left", "right"]),
        inset(7.3, 9.4, 4.2, 3.6, 2),
        cell(H(13.8, 13.2), RIGHT, bottom(17.6), LEFT, STRIP, ["bottom"]),
      ],
    },
    {
      focus: 3,
      height: 17.6,
      slots: [
        ...row(TOP, H(4.4, 5.0), [V(5.4, 5.0, 0, 4.7)], [MEDIUM, CLOSE]),
        inset(0.5, 5.3, 4.4, 3.7, 3),
        cell(H(4.4, 5.0), RIGHT, H(13.8, 13.2), LEFT, HERO, ["left", "right"]),
        cell(H(13.8, 13.2), RIGHT, bottom(17.6), LEFT, STRIP, ["bottom"]),
      ],
    },
    {
      focus: 4,
      height: 17.4,
      slots: [
        ...row(TOP, H(4.2, 4.8), [V(4.6, 4.2, 0, 4.5), V(8.4, 8.0, 0, 4.5)], [MEDIUM, NARROW, CLOSE]),
        inset(0.5, 5.1, 4.3, 3.6, 4),
        cell(H(4.2, 4.8), RIGHT, bottom(17.4), LEFT, HERO, ["left", "right", "bottom"]),
      ],
    },
  ],
};

const column5: PageTemplate = {
  id: "column-5",
  name: "Tall column",
  count: 5,
  variants: [
    {
      focus: 0,
      height: 16.8,
      slots: [
        cell(TOP, V(7.6, 6.9, 0, 10.5), H(10.8, 10.2), LEFT, HERO, ["top", "left"]),
        ...column(V(7.6, 6.9, 0, 10.5), RIGHT, [TOP, H(5.6, 5.0), H(10.8, 10.2)], [CLOSE, MEDIUM]),
        ...row(H(10.8, 10.2), bottom(16.8), [V(5.4, 5.8, 10.5, 16.8)], [MEDIUM, CLOSE]),
      ],
    },
    {
      focus: 1,
      height: 17.2,
      slots: [
        cell(TOP, RIGHT, H(3.8, 4.4), LEFT, STRIP, ["top"]),
        cell(H(3.8, 4.4), V(7.4, 7.9, 4.1, 13.7), H(14.0, 13.4), LEFT, HERO, ["left"]),
        ...column(V(7.4, 7.9, 4.1, 13.7), RIGHT, [H(3.8, 4.4), H(8.8, 9.4), H(14.0, 13.4)], [CLOSE, MEDIUM]),
        cell(H(14.0, 13.4), RIGHT, bottom(17.2), LEFT, STRIP, ["bottom"]),
      ],
    },
  ],
};

const steps5: PageTemplate = {
  id: "steps-5",
  name: "Staircase",
  count: 5,
  variants: [
    {
      focus: 3,
      height: 19,
      slots: [
        cell(TOP, RIGHT, H(3.6, 4.4), LEFT, STRIP, ["top"]),
        ...row(H(3.6, 4.4), H(8.6, 9.4), [V(5.2, 5.8, 4, 9)], [MEDIUM, CLOSE]),
        cell(H(8.6, 9.4), RIGHT, H(15.4, 14.8), LEFT, HERO, ["left", "right"]),
        cell(H(15.4, 14.8), RIGHT, bottom(19), LEFT, STRIP, ["bottom"]),
      ],
    },
  ],
};

/* ---------- 6 panels ---------- */

const vista6: PageTemplate = {
  id: "vista-6",
  name: "Opening vista",
  count: 6,
  variants: [
    {
      focus: 0,
      height: 17.2,
      slots: [
        cell(TOP, RIGHT, H(7.8, 7.0), LEFT, HERO, ["top", "left", "right"]),
        ...row(H(7.8, 7.0), H(12.0, 12.6), [V(4.4, 4.0, 7.4, 12.3), V(8.0, 8.5, 7.4, 12.3)], [MEDIUM, NARROW, CLOSE]),
        ...row(H(12.0, 12.6), bottom(17.2), [V(6.6, 7.2, 12.3, 17.2)], [MEDIUM, CLOSE]),
      ],
    },
    {
      focus: 5,
      height: 18.8,
      slots: [
        ...row(TOP, H(4.4, 3.8), [V(4.8, 5.3, 0, 4.1)], [CLOSE, MEDIUM]),
        ...row(H(4.4, 3.8), H(8.6, 9.2), [V(3.7, 4.1, 4.1, 8.9), V(8.2, 7.8, 4.1, 8.9)], [NARROW, MEDIUM, CLOSE]),
        cell(H(8.6, 9.2), RIGHT, bottom(18.8), LEFT, HERO, ["left", "right", "bottom"]),
      ],
    },
  ],
};

const inset6: PageTemplate = {
  id: "inset-6",
  name: "Hero with an inset",
  count: 6,
  variants: [
    {
      focus: 2,
      height: 17.4,
      slots: [
        ...row(TOP, H(4.3, 4.9), [V(6.9, 6.5, 0, 4.6)], [MEDIUM, CLOSE]),
        cell(H(4.3, 4.9), RIGHT, H(13.0, 12.4), LEFT, HERO, ["left", "right"]),
        inset(7.4, 8.7, 4.1, 3.5, 2),
        ...row(H(13.0, 12.4), bottom(17.4), [V(4.6, 5.1, 12.7, 17.4)], [CLOSE, MEDIUM]),
      ],
    },
    {
      focus: 3,
      height: 17.4,
      slots: [
        ...row(TOP, H(4.3, 4.9), [V(6.9, 6.5, 0, 4.6)], [MEDIUM, CLOSE]),
        inset(0.5, 5.3, 4.2, 3.6, 3),
        cell(H(4.3, 4.9), RIGHT, H(13.0, 12.4), LEFT, HERO, ["left", "right"]),
        ...row(H(13.0, 12.4), bottom(17.4), [V(4.6, 5.1, 12.7, 17.4)], [CLOSE, MEDIUM]),
      ],
    },
    {
      focus: 4,
      height: 19.2,
      slots: [
        ...row(TOP, H(4.4, 3.8), [V(5.6, 5.1, 0, 4.1)], [MEDIUM, CLOSE]),
        ...row(H(4.4, 3.8), H(8.6, 9.2), [V(7.4, 7.9, 4.1, 8.9)], [MEDIUM, CLOSE]),
        cell(H(8.6, 9.2), RIGHT, bottom(19.2), LEFT, HERO, ["left", "right", "bottom"]),
        inset(7.4, 14.9, 4.2, 3.7, 4),
      ],
    },
    {
      focus: 5,
      height: 19.2,
      slots: [
        ...row(TOP, H(4.4, 3.8), [V(5.6, 5.1, 0, 4.1)], [MEDIUM, CLOSE]),
        ...row(H(4.4, 3.8), H(8.6, 9.2), [V(7.4, 7.9, 4.1, 8.9)], [MEDIUM, CLOSE]),
        inset(0.5, 9.6, 4.2, 3.6, 5),
        cell(H(8.6, 9.2), RIGHT, bottom(19.2), LEFT, HERO, ["left", "right", "bottom"]),
      ],
    },
  ],
};

const column6: PageTemplate = {
  id: "column-6",
  name: "Tall column",
  count: 6,
  variants: [
    {
      focus: 0,
      height: 16,
      slots: [
        cell(TOP, V(7.6, 6.9, 0, 10.7), H(11.0, 10.4), LEFT, HERO, ["top", "left"]),
        ...column(V(7.6, 6.9, 0, 10.7), RIGHT, [TOP, H(5.6, 5.0), H(11.0, 10.4)], [CLOSE, MEDIUM]),
        ...row(H(11.0, 10.4), bottom(16), [V(4.2, 4.6, 10.7, 16), V(8.4, 8.0, 10.7, 16)], [MEDIUM, NARROW, CLOSE]),
      ],
    },
    {
      focus: 1,
      height: 18.4,
      slots: [
        cell(TOP, RIGHT, H(3.8, 4.4), LEFT, STRIP, ["top"]),
        cell(H(3.8, 4.4), V(7.6, 7.1, 4.1, 13.3), H(13.6, 13.0), LEFT, HERO, ["left"]),
        ...column(V(7.6, 7.1, 4.1, 13.3), RIGHT, [H(3.8, 4.4), H(8.2, 8.8), H(13.6, 13.0)], [CLOSE, MEDIUM]),
        ...row(H(13.6, 13.0), bottom(18.4), [V(5.8, 5.3, 13.3, 18.4)], [MEDIUM, CLOSE]),
      ],
    },
    {
      focus: 3,
      height: 17,
      slots: [
        ...row(TOP, H(4.3, 4.9), [V(4.5, 4.1, 0, 4.6), V(8.0, 8.4, 0, 4.6)], [MEDIUM, NARROW, CLOSE]),
        cell(H(4.3, 4.9), V(7.9, 7.1, 4.6, 17), bottom(17), LEFT, HERO, ["left", "bottom"]),
        ...column(V(7.9, 7.1, 4.6, 17), RIGHT, [H(4.3, 4.9), H(10.6, 11.2), bottom(17)], [CLOSE, MEDIUM]),
      ],
    },
  ],
};

const beats6: PageTemplate = {
  id: "beats-6",
  name: "Beat by beat",
  count: 6,
  variants: [
    {
      focus: 1,
      height: 19.4,
      slots: [
        cell(TOP, RIGHT, H(3.6, 4.2), LEFT, STRIP, ["top"]),
        cell(H(3.6, 4.2), RIGHT, H(11.4, 10.8), LEFT, HERO, ["left", "right"]),
        ...row(H(11.4, 10.8), H(15.6, 16.2), [V(4.8, 4.4, 11.1, 15.9), V(8.2, 8.6, 11.1, 15.9)], [MEDIUM, NARROW, CLOSE]),
        cell(H(15.6, 16.2), RIGHT, bottom(19.4), LEFT, STRIP, ["bottom"]),
      ],
    },
    {
      focus: 2,
      height: 17.6,
      slots: [
        ...row(TOP, H(4.6, 4.0), [V(5.2, 5.7, 0, 4.3)], [CLOSE, MEDIUM]),
        cell(H(4.6, 4.0), RIGHT, H(12.4, 13.0), LEFT, HERO, ["left", "right"]),
        ...row(H(12.4, 13.0), bottom(17.6), [V(3.9, 4.3, 12.7, 17.6), V(7.8, 8.2, 12.7, 17.6)], [CLOSE, NARROW, MEDIUM]),
      ],
    },
    {
      focus: 4,
      height: 19.6,
      slots: [
        ...row(TOP, H(4.6, 4.0), [V(4.2, 4.6, 0, 4.3), V(8.6, 8.2, 0, 4.3)], [MEDIUM, NARROW, CLOSE]),
        cell(H(4.6, 4.0), RIGHT, H(7.6, 8.2), LEFT, STRIP),
        cell(H(7.6, 8.2), RIGHT, H(15.8, 15.2), LEFT, HERO, ["left", "right"]),
        cell(H(15.8, 15.2), RIGHT, bottom(19.6), LEFT, STRIP, ["bottom"]),
      ],
    },
  ],
};

export const TEMPLATES: readonly PageTemplate[] = [
  vista4,
  turn4,
  inset4,
  column4,
  vista5,
  turn5,
  inset5,
  column5,
  steps5,
  vista6,
  inset6,
  column6,
  beats6,
];

export function templateById(id: string): PageTemplate | undefined {
  return TEMPLATES.find((template) => template.id === id);
}
