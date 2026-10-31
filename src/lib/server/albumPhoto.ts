import "server-only";
import sharp from "sharp";

/**
 * Real photos for a day's album. Every photo is decoded and re-encoded here
 * before it is kept, which drops all metadata (EXIF, GPS location, camera
 * serials, XMP, ICC beyond sRGB): sharp writes none unless asked to. It is
 * turned upright first (the EXIF orientation is applied, then dropped) and
 * shrunk to at most 2048 px a side.
 */

export const MAX_ALBUM_PHOTO_BYTES = 5 * 1024 * 1024;
export const ALBUM_PHOTO_SIDE = 2048;
/** Refuse decoding anything bigger than this many pixels (a 48 MP phone photo fits). */
const MAX_INPUT_PIXELS = 50_000_000;

export type AlbumPhotoType = "image/jpeg" | "image/png" | "image/webp" | "image/heic";

const HEIF_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"]);

/** What the first bytes say the file is: JPEG, PNG, WebP or HEIC; null for anything else. */
export function sniffAlbumPhoto(bytes: Uint8Array): AlbumPhotoType | null {
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && bytes[0] === 0x89 && ascii(1, 4) === "PNG" && bytes[4] === 0x0d && bytes[5] === 0x0a) return "image/png";
  if (bytes.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  if (bytes.length >= 12 && ascii(4, 8) === "ftyp" && HEIF_BRANDS.has(ascii(8, 12))) return "image/heic";
  return null;
}

export class AlbumPhotoError extends Error {
  name = "AlbumPhotoError";
}

export interface ProcessedPhoto {
  data: Uint8Array;
  width: number;
  height: number;
}

/**
 * Check, straighten, shrink and re-encode one photo as a metadata-free JPEG.
 * Throws AlbumPhotoError with a message the person can act on.
 */
export async function processAlbumPhoto(bytes: Uint8Array): Promise<ProcessedPhoto> {
  if (bytes.byteLength === 0) throw new AlbumPhotoError("That photo is empty.");
  if (bytes.byteLength > MAX_ALBUM_PHOTO_BYTES) throw new AlbumPhotoError("That photo is too big. Each photo can be up to 5 MB.");
  const type = sniffAlbumPhoto(bytes);
  if (!type) throw new AlbumPhotoError("Use a JPEG, PNG, WebP or HEIC photo.");
  try {
    const { data, info } = await sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS, failOn: "error", animated: false })
      .rotate()
      .resize({ width: ALBUM_PHOTO_SIDE, height: ALBUM_PHOTO_SIDE, fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .toColourspace("srgb")
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });
    return { data: new Uint8Array(data), width: info.width, height: info.height };
  } catch {
    if (type === "image/heic") {
      throw new AlbumPhotoError(
        "This server can't open iPhone HEIC photos. Share the photo as JPEG (on iPhone: Settings, Camera, Formats, Most Compatible) and add it again.",
      );
    }
    throw new AlbumPhotoError("That photo couldn't be read. Try another one.");
  }
}
