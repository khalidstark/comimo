import { describe, expect, it } from "vitest";
import {
  aspectOf,
  boundingBox,
  innerRect,
  insetQuad,
  intersect,
  leanDegrees,
  line,
  percentIn,
  quadArea,
  rectQuad,
  round,
} from "./geometry";

describe("geometry", () => {
  it("finds where two lines cross", () => {
    expect(intersect(line([0, 0], [4, 4]), line([0, 4], [4, 0]))).toEqual([2, 2]);
  });

  it("falls back to the first line's start for parallel lines", () => {
    expect(intersect(line([0, 0], [1, 0]), line([0, 1], [1, 1]))).toEqual([0, 0]);
  });

  it("builds a quad from a rectangle and measures it", () => {
    const quad = rectQuad({ x: 1, y: 2, w: 4, h: 3 });
    expect(quadArea(quad)).toBe(12);
    expect(boundingBox(quad)).toEqual({ x: 1, y: 2, w: 4, h: 3 });
    expect(innerRect(quad)).toEqual({ x: 1, y: 2, w: 4, h: 3 });
    expect(aspectOf({ x: 0, y: 0, w: 4, h: 2 })).toBe(2);
  });

  it("insets every edge by its own distance", () => {
    const quad = rectQuad({ x: 0, y: 0, w: 10, h: 10 });
    expect(insetQuad(quad, [1, 2, 3, 4])).toEqual([
      [4, 1],
      [8, 1],
      [8, 7],
      [4, 7],
    ]);
  });

  it("moves edges outward for negative distances", () => {
    const quad = rectQuad({ x: 0, y: 0, w: 10, h: 10 });
    expect(quadArea(insetQuad(quad, [-1, -1, -1, -1]))).toBe(144);
  });

  it("measures how far an edge leans", () => {
    expect(leanDegrees([0, 0], [10, 0])).toBe(0);
    expect(leanDegrees([0, 0], [0, 10])).toBe(0);
    expect(leanDegrees([0, 0], [10, 10])).toBe(45);
    expect(leanDegrees([0, 0], [100, 5])).toBeCloseTo(2.862, 3);
  });

  it("gives a point as a rounded percentage of a box", () => {
    expect(percentIn([5, 5], { x: 0, y: 0, w: 10, h: 20 })).toEqual([50, 25]);
    expect(percentIn([1, 0], { x: 0, y: 0, w: 3, h: 1 })).toEqual([33.33, 0]);
  });

  it("rounds to the given places", () => {
    expect(round(1.23456)).toBe(1.23);
    expect(round(1.23456, 3)).toBe(1.235);
  });
});
