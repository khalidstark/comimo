import type { Rect } from "./geometry";

/**
 * Where a panel's caption and bubbles go once SAM has found the people in
 * it: in the free space of the panel, never over a head (any head, not only
 * the speaker's) or an inset laid over the panel, and over bodies only when
 * nothing else fits. Reading order is kept (caption first, then the lines in
 * order) and each bubble sits near its speaker's head with the tail pointing
 * at it. Pure: the reader measures the boxes and applies the result.
 */

export interface LetteringItem {
  kind: "caption" | "bubble";
  /** Sizes this item can be set at (different widths), in px. */
  sizes: { w: number; h: number }[];
  /** The speaker's head, for a bubble whose speaker SAM found. */
  target?: Rect;
  /** Right-to-left captions prefer the right edge. */
  rtl?: boolean;
  /** For a bubble without a found speaker: which side its speaker stands on. */
  side?: "left" | "right";
}

export interface LetteringScene {
  width: number;
  height: number;
  /** Where lettering may go (the panel's uncut inner part, less a margin). */
  area: Rect;
  /** Never covered: heads (padded) and insets laid over the panel. */
  hard: Rect[];
  /** Covered only when nothing else fits: bodies. */
  soft: Rect[];
  items: LetteringItem[];
}

export interface LetteringSpot {
  x: number;
  y: number;
  /** Which of the item's sizes was used. */
  size: number;
  /** For a bubble with a target: where along its width the tail sits (px), and whether it points up. */
  tail?: { x: number; up: boolean };
}

export interface LetteringPlan {
  spots: LetteringSpot[];
  /** True when nothing covers a head, an inset or another item. */
  clear: boolean;
  /** True when no body is covered either. */
  roomy: boolean;
  cost: number;
}

const STEPS = 22;

function overlap(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

function positions(start: number, room: number): number[] {
  if (room <= 0) return [start];
  const out: number[] = [];
  for (let i = 0; i <= STEPS; i++) out.push(start + (room * i) / STEPS);
  return out;
}

export function placeLettering(scene: LetteringScene): LetteringPlan {
  const { width: W, height: H, area } = scene;
  const placed: Rect[] = [];
  const spots: LetteringSpot[] = [];
  let total = 0;
  let clear = true;
  let roomy = true;
  let previousBubble: Rect | null = null;
  let caption: Rect | null = null;

  for (const item of scene.items) {
    let best: { rect: Rect; cost: number; size: number; hard: number; soft: number } | null = null;
    item.sizes.forEach(({ w, h }, size) => {
      const xs = positions(area.x, area.w - w);
      const ys = positions(area.y, area.h - h);
      for (const y of ys) {
        for (const x of xs) {
          const rect = { x, y, w: Math.min(w, area.w), h: Math.min(h, area.h) };
          const itemArea = rect.w * rect.h;
          const hard = [...scene.hard, ...placed].reduce((sum, r) => sum + overlap(rect, r), 0) / itemArea;
          const soft = scene.soft.reduce((sum, r) => sum + overlap(rect, r), 0) / itemArea;
          let cost = (hard > 0 ? 1000 + hard * 1000 : 0) + soft * 8;
          // Text that doesn't fit the area at this size costs a lot.
          if (w > area.w + 1 || h > area.h + 1) cost += 500;
          // Wider settings are a little better (fewer lines), narrower only when they help.
          cost += size * 0.15;
          if (item.kind === "caption") {
            cost += ((y - area.y) / H) * 3;
            cost += ((item.rtl ? area.x + area.w - (x + w) : x - area.x) / W) * 1.2;
          } else if (item.target) {
            const t = item.target;
            const dx = Math.abs(x + w / 2 - (t.x + t.w / 2)) / W;
            const bottom = y + h;
            const dy = bottom <= t.y ? (t.y - bottom) / H : ((bottom - t.y) / H) * 2;
            cost += dx * 1.6 + dy * 1.4 + ((y - area.y) / H) * 0.6;
          } else {
            cost += ((y - area.y) / H) * 2;
            const sideGap = item.side === "right" ? area.x + area.w - (x + w) : x - area.x;
            cost += (sideGap / W) * 0.8;
          }
          // Reading order: a bubble clearly above and left of the one before it would be read first.
          if (item.kind === "bubble" && previousBubble && y + h * 0.25 < previousBubble.y && x + w / 2 < previousBubble.x + previousBubble.w / 2) cost += 1.5;
          if (caption && y + h <= caption.y) cost += 0.6;
          if (!best || cost < best.cost) best = { rect, cost, size, hard, soft };
        }
      }
    });
    const chosen = best!;
    placed.push(chosen.rect);
    total += chosen.cost;
    if (chosen.hard > 0) clear = false;
    if (chosen.soft > 0.02) roomy = false;
    const spot: LetteringSpot = { x: chosen.rect.x, y: chosen.rect.y, size: chosen.size };
    if (item.kind === "bubble") {
      previousBubble = chosen.rect;
      if (item.target) {
        const t = item.target;
        const margin = Math.min(16, chosen.rect.w / 3);
        spot.tail = {
          x: Math.min(chosen.rect.w - margin, Math.max(margin, t.x + t.w / 2 - chosen.rect.x)),
          up: chosen.rect.y > t.y + t.h * 0.5,
        };
      }
    } else {
      caption = chosen.rect;
    }
    spots.push(spot);
  }
  return { spots, clear, roomy, cost: total };
}
