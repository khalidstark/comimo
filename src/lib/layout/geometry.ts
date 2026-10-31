/**
 * Plane geometry for comic pages. A page is measured in "units": it is 12
 * units wide, and each panel is a quadrilateral cut out of it by straight
 * lines (gutters), which may lean a few degrees.
 *
 * Shared by the browser (rendering) and the server (panel sizes), so it has
 * no imports.
 */

export type Pt = readonly [number, number];

export type PageEdge = "top" | "right" | "bottom" | "left";

/** An infinite line through two points. `edge` marks the page's own borders. */
export interface Line {
  a: Pt;
  b: Pt;
  edge?: PageEdge;
}

/** Corners in order: top-left, top-right, bottom-right, bottom-left (clockwise on screen). */
export type Quad = readonly [Pt, Pt, Pt, Pt];

/** Top, right, bottom and left edges of a quad, in the same order as their distances. */
export type EdgeValues = readonly [number, number, number, number];

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function line(a: Pt, b: Pt, edge?: PageEdge): Line {
  return edge ? { a, b, edge } : { a, b };
}

/** Where two infinite lines cross. Parallel lines fall back to the first line's start. */
export function intersect(l1: Line, l2: Line): Pt {
  const [x1, y1] = l1.a;
  const [x2, y2] = l1.b;
  const [x3, y3] = l2.a;
  const [x4, y4] = l2.b;
  const d = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(d) < 1e-9) return l1.a;
  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / d;
  return [x1 + t * (x2 - x1), y1 + t * (y2 - y1)];
}

/** The quad bounded by four lines. */
export function cellQuad(top: Line, right: Line, bottom: Line, left: Line): Quad {
  return [intersect(top, left), intersect(top, right), intersect(bottom, right), intersect(bottom, left)];
}

export function rectQuad({ x, y, w, h }: Rect): Quad {
  return [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
  ];
}

/**
 * Move every edge of a convex quad inward by its own distance (negative moves
 * it out), keeping its angle. Used to open gutters between panels.
 */
export function insetQuad(quad: Quad, distances: EdgeValues): Quad {
  const shifted: Line[] = [0, 1, 2, 3].map((i) => {
    const a = quad[i];
    const b = quad[(i + 1) % 4];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const length = Math.hypot(dx, dy) || 1;
    // Inward normal for a clockwise quad with y pointing down.
    const nx = (-dy / length) * distances[i];
    const ny = (dx / length) * distances[i];
    return line([a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny]);
  });
  return [
    intersect(shifted[3], shifted[0]),
    intersect(shifted[0], shifted[1]),
    intersect(shifted[1], shifted[2]),
    intersect(shifted[2], shifted[3]),
  ];
}

/** Shoelace area. */
export function quadArea(quad: Quad): number {
  let sum = 0;
  for (let i = 0; i < 4; i++) {
    const [x1, y1] = quad[i];
    const [x2, y2] = quad[(i + 1) % 4];
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) / 2;
}

export function boundingBox(quad: Quad): Rect {
  const xs = quad.map((p) => p[0]);
  const ys = quad.map((p) => p[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/** The largest upright rectangle inside a near-rectangular quad: what the slanted edges never cut. */
export function innerRect(quad: Quad): Rect {
  const [tl, tr, br, bl] = quad;
  const x = Math.max(tl[0], bl[0]);
  const y = Math.max(tl[1], tr[1]);
  return { x, y, w: Math.min(tr[0], br[0]) - x, h: Math.min(bl[1], br[1]) - y };
}

/** Width over height. */
export function aspectOf(rect: Rect): number {
  return rect.w / rect.h;
}

/** How far an edge leans from straight, in degrees (0 for a level or plumb edge). */
export function leanDegrees(a: Pt, b: Pt): number {
  const dx = Math.abs(b[0] - a[0]);
  const dy = Math.abs(b[1] - a[1]);
  const angle = (Math.atan2(Math.min(dx, dy), Math.max(dx, dy)) * 180) / Math.PI;
  return angle;
}

/** A point as a percentage of a box, rounded for CSS. */
export function percentIn(point: Pt, box: Rect): Pt {
  return [round(((point[0] - box.x) / box.w) * 100), round(((point[1] - box.y) / box.h) * 100)];
}

export function round(value: number, places = 2): number {
  const f = 10 ** places;
  return Math.round(value * f) / f;
}
