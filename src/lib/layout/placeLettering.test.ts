import { describe, expect, it } from "vitest";
import type { Rect } from "./geometry";
import { placeLettering } from "./placeLettering";

function overlaps(a: Rect, b: Rect): boolean {
  return Math.min(a.x + a.w, b.x + b.w) > Math.max(a.x, b.x) && Math.min(a.y + a.h, b.y + b.h) > Math.max(a.y, b.y);
}

describe("lettering placement", () => {
  // A wide table panel, 600 x 300: three people whose heads reach the top third (the art ignored the empty band).
  const heads: Rect[] = [
    { x: 60, y: 40, w: 90, h: 90 },
    { x: 255, y: 30, w: 90, h: 95 },
    { x: 450, y: 45, w: 90, h: 90 },
  ];
  const bodies: Rect[] = heads.map((h) => ({ x: h.x - 40, y: h.y, w: h.w + 80, h: 300 - h.y }));

  it("keeps every bubble and caption off every head in a busy panel", () => {
    const plan = placeLettering({
      width: 600,
      height: 300,
      area: { x: 6, y: 6, w: 588, h: 288 },
      hard: heads,
      soft: bodies,
      items: [
        { kind: "caption", sizes: [{ w: 540, h: 30 }, { w: 300, h: 50 }] },
        { kind: "bubble", sizes: [{ w: 150, h: 60 }], target: heads[0] },
        { kind: "bubble", sizes: [{ w: 150, h: 60 }], target: heads[2] },
      ],
    });
    expect(plan.clear).toBe(true);
    const rects = plan.spots.map((spot, i) => ({ x: spot.x, y: spot.y, w: [[540, 300][spot.size], 150, 150][i], h: [[30, 50][spot.size], 60, 60][i] }));
    for (const rect of rects) for (const head of heads) expect(overlaps(rect, head)).toBe(false);
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) expect(overlaps(rects[i], rects[j])).toBe(false);
  });

  it("puts a bubble near its speaker and points the tail at their head", () => {
    const plan = placeLettering({
      width: 600,
      height: 400,
      area: { x: 0, y: 0, w: 600, h: 400 },
      hard: [{ x: 420, y: 200, w: 80, h: 80 }],
      soft: [],
      items: [{ kind: "bubble", sizes: [{ w: 160, h: 70 }], target: { x: 420, y: 200, w: 80, h: 80 } }],
    });
    const [spot] = plan.spots;
    expect(spot.x + 80).toBeGreaterThan(330);
    expect(spot.y + 70).toBeLessThanOrEqual(200);
    expect(spot.tail?.up).toBe(false);
    expect(spot.x + spot.tail!.x).toBeGreaterThan(420);
  });

  it("says when a panel has no room left", () => {
    const plan = placeLettering({
      width: 200,
      height: 100,
      area: { x: 0, y: 0, w: 200, h: 100 },
      hard: [{ x: 0, y: 0, w: 200, h: 100 }],
      soft: [],
      items: [{ kind: "caption", sizes: [{ w: 150, h: 30 }] }],
    });
    expect(plan.clear).toBe(false);
  });
});
