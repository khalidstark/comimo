import "server-only";
import sharp from "sharp";
import type { UnitBox } from "@/lib/types";
import type { CharacterReference, ModelImage } from "./index";

/**
 * One-off characters (03-06) have no reference sheet. Their first panel is
 * drawn from the note's description; every later panel gets that first
 * appearance as their reference, cut down to the box SAM 3.1 found them in,
 * so Muse Image copies the person and not the whole earlier scene, and the
 * face check compares like with like.
 */

/** Room kept around the figure, as a share of its box. */
const PAD = 0.12;
/** Longest side of the cut-out: plenty for a face and an outfit. */
const MAX_SIDE = 1024;

function validBox(box: UnitBox): boolean {
  const ok = (v: number) => Number.isFinite(v) && v >= 0 && v <= 1;
  return ok(box.x) && ok(box.y) && ok(box.w) && ok(box.h) && box.w >= 0.03 && box.h >= 0.03;
}

/** The figure in `box` (fractions of the image), padded, as WebP; null if it can't be cut. */
export async function cutAppearance(image: ModelImage, box: UnitBox): Promise<ModelImage | null> {
  if (!validBox(box)) return null;
  try {
    const { width = 0, height = 0 } = await sharp(image.data).metadata();
    if (!width || !height) return null;
    const left = Math.max(0, Math.floor((box.x - box.w * PAD) * width));
    const top = Math.max(0, Math.floor((box.y - box.h * PAD) * height));
    const right = Math.min(width, Math.ceil((box.x + box.w * (1 + PAD)) * width));
    const bottom = Math.min(height, Math.ceil((box.y + box.h * (1 + PAD)) * height));
    if (right - left < 16 || bottom - top < 16) return null;
    const data = await sharp(image.data)
      .extract({ left, top, width: right - left, height: bottom - top })
      .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 88 })
      .toBuffer();
    return { mimeType: "image/webp", data: new Uint8Array(data) };
  } catch {
    return null;
  }
}

/**
 * References with every one-off's earlier panel cut down to them. Without a
 * box (SAM didn't find them there) the whole earlier panel is kept, and the
 * prompt says where to look.
 */
export async function cutOneOffs(references: CharacterReference[]): Promise<CharacterReference[]> {
  return Promise.all(
    references.map(async (ref) => {
      if (!ref.oneOff || !ref.image || !ref.box) return ref;
      const cut = await cutAppearance(ref.image, ref.box);
      if (!cut) return ref;
      const { box: _box, ...rest } = ref;
      void _box;
      return { ...rest, image: cut };
    }),
  );
}
