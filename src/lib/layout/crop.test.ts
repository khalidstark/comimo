import { describe, expect, it } from "vitest";
import type { PanelFigures } from "../types";
import { coverCrop, objectPosition, throughCrop } from "./crop";

const figures = (box: { x: number; y: number; w: number; h: number }, head = box): PanelFigures => ({
  aspect: 1,
  items: [{ characterId: "a", box, head } as PanelFigures["items"][number]],
});

describe("coverCrop", () => {
  it("shows the whole image when the aspects match", () => {
    expect(coverCrop(1, 1)).toEqual({ x: 0, y: 0, w: 1, h: 1 });
  });

  it("centres the view without figures or a zone", () => {
    const crop = coverCrop(2, 1);
    expect(crop.w).toBeCloseTo(0.5);
    expect(crop.h).toBe(1);
    expect(crop.x).toBeCloseTo(0.25);
  });

  it("keeps a figure in view when the view is cut on the width", () => {
    const crop = coverCrop(2, 1, figures({ x: 0.7, y: 0.2, w: 0.2, h: 0.6 }));
    expect(crop.x).toBeLessThanOrEqual(0.7);
    expect(crop.x + crop.w).toBeGreaterThanOrEqual(0.9 - 1e-9);
  });

  it("falls back to the heads when the bodies do not fit", () => {
    const crop = coverCrop(
      2,
      1,
      figures({ x: 0, y: 0, w: 1, h: 1 }, { x: 0.8, y: 0.1, w: 0.1, h: 0.1 }),
    );
    expect(crop.x).toBeLessThanOrEqual(0.8);
    expect(crop.x + crop.w).toBeGreaterThanOrEqual(0.9 - 1e-9);
  });

  it("keeps a slice of a left lettering zone in view", () => {
    const crop = coverCrop(2, 1, null, { side: "left", size: 0.3 });
    expect(crop.x).toBeCloseTo(0.3 - 0.34 * 0.5);
  });

  it("never lets the window leave the image", () => {
    const crop = coverCrop(2, 1, null, { side: "right", size: 0.9 });
    expect(crop.x).toBeGreaterThanOrEqual(0);
    expect(crop.x + crop.w).toBeLessThanOrEqual(1 + 1e-9);
  });
});

describe("objectPosition", () => {
  it("is 50% on an axis that is not cropped", () => {
    expect(objectPosition({ x: 0, y: 0, w: 1, h: 1 })).toBe("50% 50%");
  });

  it("turns a window start into a percentage of the free room", () => {
    expect(objectPosition({ x: 0.25, y: 0, w: 0.5, h: 1 })).toBe("50% 50%");
    expect(objectPosition({ x: 0, y: 0, w: 0.5, h: 1 })).toBe("0% 50%");
    expect(objectPosition({ x: 0.5, y: 0, w: 0.5, h: 1 })).toBe("100% 50%");
  });
});

describe("throughCrop", () => {
  it("maps a box into the shown window", () => {
    const box = throughCrop({ x: 0.5, y: 0.25, w: 0.25, h: 0.5 }, { x: 0.25, y: 0, w: 0.5, h: 1 });
    expect(box).toEqual({ x: 0.5, y: 0.25, w: 0.5, h: 0.5 });
  });
});
