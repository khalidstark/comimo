import { describe, expect, it } from "vitest";
import { frameAt, frameUrls, loadOrder } from "./sequence";

describe("frameUrls", () => {
  it("zero-pads from 000 under /media/<dir>", () => {
    expect(frameUrls("hero", 3)).toEqual(["/media/hero/000.webp", "/media/hero/001.webp", "/media/hero/002.webp"]);
  });

  it("reaches the last of 48 frames", () => {
    const urls = frameUrls("hero", 48);
    expect(urls).toHaveLength(48);
    expect(urls.at(-1)).toBe("/media/hero/047.webp");
  });

  it("is empty for no frames, and floors fractions", () => {
    expect(frameUrls("ink", 0)).toEqual([]);
    expect(frameUrls("ink", -2)).toEqual([]);
    expect(frameUrls("ink", 2.7)).toHaveLength(2);
  });
});

describe("frameAt", () => {
  it("maps the ends to the first and last frame", () => {
    expect(frameAt(0, 48)).toBe(0);
    expect(frameAt(1, 48)).toBe(47);
  });

  it("clamps progress outside 0..1", () => {
    expect(frameAt(-0.4, 48)).toBe(0);
    expect(frameAt(1.7, 48)).toBe(47);
  });

  it("rounds to the nearest frame", () => {
    expect(frameAt(0.5, 48)).toBe(24); // 23.5 rounds up
    expect(frameAt(0.35, 48)).toBe(16); // 16.45
    expect(frameAt(0.5, 3)).toBe(1);
    expect(frameAt(0.24, 3)).toBe(0);
    expect(frameAt(0.26, 3)).toBe(1);
  });

  it("treats NaN as the start and tiny sequences as one frame", () => {
    expect(frameAt(Number.NaN, 48)).toBe(0);
    expect(frameAt(0.8, 1)).toBe(0);
    expect(frameAt(0.8, 0)).toBe(0);
  });
});

describe("loadOrder", () => {
  it("starts at the given frame and alternates outward", () => {
    expect(loadOrder(6, 2)).toEqual([2, 3, 1, 4, 0, 5]);
  });

  it("covers every frame once from either end", () => {
    expect(loadOrder(4, 0)).toEqual([0, 1, 2, 3]);
    expect(loadOrder(4, 3)).toEqual([3, 2, 1, 0]);
    expect(new Set(loadOrder(48, 17)).size).toBe(48);
  });

  it("clamps a start outside the sequence", () => {
    expect(loadOrder(3, 9)).toEqual([2, 1, 0]);
    expect(loadOrder(0, 0)).toEqual([]);
  });
});
