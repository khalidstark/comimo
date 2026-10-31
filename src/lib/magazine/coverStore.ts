import { artAt } from "@/art/manifest";
import { referenceFileTokenFor, referenceSheetFor } from "../cast";
import type { ArtStyleId } from "../artStyles";
import { getImage, getMeta, putImage, setMeta } from "../store";
import type { ApiError, Character, CoverRequest, CoverResponse, MonthKey, WireReference } from "../types";
import { blobToWire, wireToBlob } from "../wireImage";

/**
 * A month's cover is drawn once and kept on this device: the image in the
 * store's `images` object store, its tagline in `meta` under "cover:YYYY-MM".
 */

export interface StoredCover {
  imageId: string;
  tagline: string;
  drawnAt: string;
}

const metaKey = (month: MonthKey) => `cover:${month}`;

export async function getStoredCover(month: MonthKey): Promise<StoredCover | null> {
  const raw = await getMeta(metaKey(month));
  if (typeof raw !== "string") return null;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredCover>;
    return typeof parsed.imageId === "string" && typeof parsed.tagline === "string" && typeof parsed.drawnAt === "string"
      ? (parsed as StoredCover)
      : null;
  } catch {
    return null;
  }
}

async function sheetFor(character: Character, style: ArtStyleId): Promise<WireReference | null> {
  const sheet = referenceSheetFor(character, style);
  if (!sheet) return null;
  const base = { characterId: character.id, name: character.name, look: character.look };
  const fileToken = referenceFileTokenFor(character, style);
  if (fileToken) return { ...base, fileToken };
  try {
    const blob =
      sheet.image.kind === "blob"
        ? await getImage(sheet.image.id)
        : await fetch(artAt(sheet.image.path).src).then((response) => (response.ok ? response.blob() : undefined));
    if (!blob) return null;
    return { ...base, image: await blobToWire(blob), ...(sheet.sheetToken ? { sheetToken: sheet.sheetToken } : {}) };
  } catch {
    return null;
  }
}

export class CoverError extends Error {
  name = "CoverError";
}

/**
 * Ask Muse Spark and Muse Image for the month's cover (POST /api/cover) and
 * keep it. `stars` are the month's main cast, the narrator first.
 */
export async function drawCover(
  month: MonthKey,
  titles: string[],
  stars: Character[],
  style: ArtStyleId,
  signal?: AbortSignal,
): Promise<StoredCover> {
  const references = (await Promise.all(stars.map((member) => sheetFor(member, style)))).filter((ref): ref is WireReference => ref !== null);
  const body: CoverRequest = { month, titles, style, cast: references };
  const response = await fetch("/api/cover", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  const data = (await response.json().catch(() => null)) as CoverResponse | ApiError | null;
  if (!response.ok || !data || !("image" in data)) {
    throw new CoverError((data && "error" in data && data.error) || `The cover couldn't be drawn (${response.status}).`);
  }

  const imageId = `cover-${month}-${Date.now().toString(36)}`;
  const saved = await putImage(imageId, wireToBlob(data.image));
  if (!saved) throw new CoverError("This browser couldn't keep the cover.");
  const cover: StoredCover = { imageId, tagline: data.tagline, drawnAt: new Date().toISOString() };
  await setMeta(metaKey(month), JSON.stringify(cover));
  return cover;
}
