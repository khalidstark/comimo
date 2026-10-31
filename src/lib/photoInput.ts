import "server-only";
import sharp, { type Metadata } from "sharp";
import type { ModelImage } from "./models";
import { sniffImageType } from "./models/meta/image";
import type { PersonBox } from "./models/meta/photo";

/**
 * Checks for a reference photo before any model sees it. The browser already
 * shrinks photos to 1536 px and JPEG; anything else is refused here. The
 * photo is re-encoded in memory (which also drops EXIF data such as GPS) and
 * never written anywhere.
 */

/** Largest photo accepted, in bytes and pixels per side. */
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const MAX_PHOTO_SIDE = 1536;
/** The cut-out person sent on to Muse Spark and Muse Image. */
const CROP_MAX_SIDE = 1024;
const PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export class PhotoInputError extends Error {
  name = "PhotoInputError";
}

/** True when the bytes start like a JPEG, PNG or WebP. Cheap: nothing is decoded. */
export function isPhotoType(bytes: Uint8Array): boolean {
  const type = sniffImageType(bytes);
  return type !== null && PHOTO_TYPES.has(type);
}

/** A JPEG, PNG or WebP (by its bytes, not its name) of at most 5 MB and 1536 px a side, re-encoded as JPEG without metadata. */
export async function readPhoto(bytes: Uint8Array): Promise<ModelImage & { width: number; height: number }> {
  if (bytes.byteLength === 0) throw new PhotoInputError("That photo is empty.");
  if (bytes.byteLength > MAX_PHOTO_BYTES) throw new PhotoInputError("That photo is too big. Use one under 5 MB.");
  const type = sniffImageType(bytes);
  if (!type || !PHOTO_TYPES.has(type)) throw new PhotoInputError("Use a JPEG, PNG or WebP photo.");
  let meta: Metadata;
  try {
    // Reads the header only; the pixel limit stops decompression bombs before decoding.
    meta = await sharp(bytes, { limitInputPixels: MAX_PHOTO_SIDE * MAX_PHOTO_SIDE, failOn: "error" }).metadata();
  } catch {
    throw new PhotoInputError("That photo couldn't be read. Try another one.");
  }
  if (!meta.width || !meta.height) throw new PhotoInputError("That photo couldn't be read. Try another one.");
  if (meta.width > MAX_PHOTO_SIDE || meta.height > MAX_PHOTO_SIDE) {
    throw new PhotoInputError(`Photos must be at most ${MAX_PHOTO_SIDE} pixels on each side.`);
  }
  try {
    const { data, info } = await sharp(bytes, { limitInputPixels: MAX_PHOTO_SIDE * MAX_PHOTO_SIDE })
      .rotate()
      .jpeg({ quality: 90 })
      .toBuffer({ resolveWithObject: true });
    return { mimeType: "image/jpeg", data: new Uint8Array(data), width: info.width, height: info.height };
  } catch {
    throw new PhotoInputError("That photo couldn't be read. Try another one.");
  }
}

/** The person cut out with a little room around them, at most 1024 px a side. */
export async function cropPerson(photo: ModelImage, width: number, height: number, box: PersonBox): Promise<ModelImage> {
  const padX = (box.x2 - box.x1) * 0.1;
  const padY = (box.y2 - box.y1) * 0.06;
  const left = Math.max(0, Math.floor(box.x1 - padX));
  const top = Math.max(0, Math.floor(box.y1 - padY));
  const right = Math.min(width, Math.ceil(box.x2 + padX));
  const bottom = Math.min(height, Math.ceil(box.y2 + padY));
  const data = await sharp(photo.data)
    .extract({ left, top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) })
    .resize({ width: CROP_MAX_SIDE, height: CROP_MAX_SIDE, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 90 })
    .toBuffer();
  return { mimeType: "image/jpeg", data: new Uint8Array(data) };
}

/** A photo crop sent back for drawing the sheet: same checks as a photo. */
export async function readPhotoCrop(image: ModelImage): Promise<ModelImage> {
  const photo = await readPhoto(image.data);
  return { mimeType: photo.mimeType, data: photo.data };
}
