import type { LetteringZone, PanelFigures, UnitBox } from "../types";

/**
 * Which part of a drawn panel shows when it is set into a slot of another
 * shape with object-fit: cover (phone pages crop panels to fill the width).
 * The crop keeps the characters SAM found in view: it centres on the union
 * of their boxes, or of their heads when the bodies don't fit, so a face is
 * never cut off. Panels without boxes keep their lettering zone in view.
 *
 * Shared by pageView (object-position) and the lettering placement in the
 * browser (to map boxes through the crop), so both agree to the pixel.
 */

/** The visible part of the image, as fractions of it (0 to 1). */
export type CropWindow = UnitBox;

function union(boxes: UnitBox[]): UnitBox | null {
  if (boxes.length === 0) return null;
  const x1 = Math.min(...boxes.map((b) => b.x));
  const y1 = Math.min(...boxes.map((b) => b.y));
  const x2 = Math.max(...boxes.map((b) => b.x + b.w));
  const y2 = Math.max(...boxes.map((b) => b.y + b.h));
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

/** Where a window of `size` (fraction) starts on one axis to show [from, to], else to centre on it. */
function place(size: number, from: number, to: number, fallback: number): number {
  if (size >= 1) return 0;
  const room = 1 - size;
  if (to - from <= size) {
    // Fits: stay as close to the fallback as possible while showing all of it.
    return Math.min(room, Math.max(0, Math.min(from, Math.max(to - size, fallback))));
  }
  return Math.min(room, Math.max(0, (from + to) / 2 - size / 2));
}

/**
 * The visible window for an image of aspect `imageAspect` shown in a box of
 * aspect `viewAspect` with cover. `figures` steer it; without them `zone`
 * keeps the lettering side in view (old days lettered into that zone).
 */
export function coverCrop(imageAspect: number, viewAspect: number, figures?: PanelFigures | null, zone?: LetteringZone): CropWindow {
  // Cover: the image is scaled to fill, so one axis shows whole and the other is cut.
  const w = Math.min(1, viewAspect / imageAspect);
  const h = Math.min(1, imageAspect / viewAspect);
  const centreX = (1 - w) / 2;
  const centreY = (1 - h) / 2;
  const characters = figures?.items.filter((item) => item.characterId) ?? [];
  const people = characters.length > 0 ? characters : (figures?.items ?? []);
  if (people.length > 0) {
    const bodies = union(people.map((item) => item.box))!;
    const heads = union(people.map((item) => item.head))!;
    const target = (axis: "x" | "y") => {
      const size = axis === "x" ? w : h;
      const length = axis === "x" ? "w" : "h";
      return bodies[length] <= size ? bodies : heads;
    };
    const tx = target("x");
    const ty = target("y");
    return {
      x: place(w, tx.x, tx.x + tx.w, centreX),
      // Vertically, keep heads in view first: start no lower than the top head allows.
      y: place(h, ty.y, ty.y + ty.h, Math.min(centreY, heads.y)),
      w,
      h,
    };
  }
  let x = centreX;
  let y = centreY;
  if (zone?.side === "left") x = 0;
  if (zone?.side === "right") x = 1 - w;
  if (zone?.side === "top") y = 0;
  return { x, y, w, h };
}

/** CSS object-position for a window (percentages of the free room on each axis). */
export function objectPosition(crop: CropWindow): string {
  const axis = (start: number, size: number) => (size >= 1 ? 50 : Math.round((start / (1 - size)) * 1000) / 10);
  return `${axis(crop.x, crop.w)}% ${axis(crop.y, crop.h)}%`;
}

/** A box on the image as fractions of the shown window (may run outside 0 to 1 when cropped off). */
export function throughCrop(box: UnitBox, crop: CropWindow): UnitBox {
  return { x: (box.x - crop.x) / crop.w, y: (box.y - crop.y) / crop.h, w: box.w / crop.w, h: box.h / crop.h };
}
