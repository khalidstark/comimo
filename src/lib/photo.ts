import type { ApiError, PhotoLookResponse, WireImage } from "./types";

/**
 * Reference photos in the browser. A photo is shrunk here to at most 1536 px
 * and re-encoded as JPEG (which also drops its EXIF data, such as location),
 * sent once to /api/character/photo, and kept only in memory: never in
 * IndexedDB, never in a URL. The caller drops it once the sheet is drawn.
 */

export const PHOTO_MAX_SIDE = 1536;
const PHOTO_MAX_BYTES = 5 * 1024 * 1024;
/** Raw files above this are refused before decoding (a phone photo is a few MB). */
const RAW_MAX_BYTES = 30 * 1024 * 1024;

export class PhotoError extends Error {
  name = "PhotoError";
}

/** JPEG, PNG or WebP by the file's first bytes, whatever its name says. */
async function isSupportedImage(file: Blob): Promise<boolean> {
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const ascii = (from: number, to: number) => String.fromCharCode(...head.subarray(from, to));
  const jpeg = head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
  const png = head[0] === 0x89 && ascii(1, 4) === "PNG";
  const webp = ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP";
  return jpeg || png || webp;
}

function toJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

/** The photo at most 1536 px a side, as a JPEG under 5 MB. */
export async function preparePhoto(file: File): Promise<Blob> {
  if (file.size > RAW_MAX_BYTES) throw new PhotoError("That photo is too big. Use one under 30 MB.");
  if (!(await isSupportedImage(file))) throw new PhotoError("Use a JPEG, PNG or WebP photo.");
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new PhotoError("That photo couldn't be opened. Try another one.");
  }
  try {
    const scale = Math.min(1, PHOTO_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new PhotoError("This browser couldn't prepare the photo.");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.9, 0.8, 0.65]) {
      const blob = await toJpeg(canvas, quality);
      if (blob && blob.size <= PHOTO_MAX_BYTES) return blob;
    }
    throw new PhotoError("That photo is too big. Try another one.");
  } finally {
    bitmap.close();
  }
}

/** Ask Comimo to find the person in the photo and describe them. */
export async function describePhoto(photo: Blob, signal?: AbortSignal): Promise<{ look: string; crop: WireImage }> {
  const form = new FormData();
  form.append("photo", photo, "photo.jpg");
  form.append("consent", "yes");
  let response: Response;
  try {
    response = await fetch("/api/character/photo", { method: "POST", body: form, signal });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new PhotoError("Couldn't reach Comimo. Check your connection and try again.");
  }
  const result = (await response.json().catch(() => null)) as PhotoLookResponse | ApiError | null;
  if (!response.ok || !result || !("look" in result)) {
    throw new PhotoError((result as ApiError | null)?.error || `The photo didn't work (${response.status}). Try another one.`);
  }
  return { look: result.look, crop: result.crop };
}
