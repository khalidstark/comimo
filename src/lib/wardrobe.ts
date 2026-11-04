import { artAt } from "@/art/manifest";
import { DEFAULT_ART_STYLE, type ArtStyleId } from "./artStyles";
import { addCosts, costFromResponse, type CostRecord } from "./costs";
import { getImage, newId, putImage } from "./store";
import {
  MAX_OUTFITS,
  type ApiError,
  type Character,
  type DayOutfit,
  type ImageRef,
  type Outfit,
  type OutfitRequest,
  type OutfitResponse,
  type ReferenceSheet,
  type WireImage,
} from "./types";
import { blobToWire, wireToBlob } from "./wireImage";

/**
 * The wardrobe: a character's other clothes, and what they wear in
 * a comic. Precedence when drawing: the day's outfit from today's photos,
 * then the outfit they chose to wear from now on, then their usual clothes.
 *
 * Pure helpers plus the browser side of /api/character/outfit. Saving is up
 * to the caller (cast.ts keeps the stored copy current).
 */

/* ---------- What they wear ---------- */

/** Their wardrobe; empty on records made before outfits. */
export function outfitsOf(character: Character): Outfit[] {
  return Array.isArray(character.outfits) ? character.outfits : [];
}

/** The outfit they wear in new comics, or null for their usual clothes (also when the chosen one was deleted). */
export function wornOutfit(character: Character): Outfit | null {
  if (!character.outfitId) return null;
  return outfitsOf(character).find((outfit) => outfit.id === character.outfitId) ?? null;
}

/** The day's outfit for a character, when today's photos dressed them. */
export function dayOutfitFor(characterId: string, dayOutfits: DayOutfit[] | null | undefined): DayOutfit | null {
  return dayOutfits?.find((outfit) => outfit.characterId === characterId) ?? null;
}

/** How they look in this comic: the day's clothes, else the worn outfit, else their usual look. */
export function lookFor(character: Character, dayOutfits?: DayOutfit[] | null): string {
  return dayOutfitFor(character.id, dayOutfits)?.look ?? wornOutfit(character)?.look ?? character.look;
}

/** Which clothes a comic draws them in. */
export type Wearing = { kind: "day"; outfit: DayOutfit } | { kind: "outfit"; outfit: Outfit } | { kind: "usual" };

export function wearingFor(character: Character, dayOutfits?: DayOutfit[] | null): Wearing {
  const day = dayOutfitFor(character.id, dayOutfits);
  if (day) return { kind: "day", outfit: day };
  const worn = wornOutfit(character);
  return worn ? { kind: "outfit", outfit: worn } : { kind: "usual" };
}

/** True for characters who can change clothes (people, not pets). */
export function canChangeClothes(character: Character): boolean {
  return character.role !== "pet";
}

/** The outfit's sheet in a style, when drawn. */
export function outfitSheet(outfit: Pick<Outfit, "sheets">, style: ArtStyleId): ReferenceSheet | null {
  return outfit.sheets?.[style] ?? null;
}

/* ---------- Changes (pure) ---------- */

/** Add an outfit (newest last) and wear it when `wear`. Refuses (null) when the wardrobe is full. */
export function withOutfit(character: Character, outfit: Outfit, wear: boolean): Character | null {
  const outfits = outfitsOf(character).filter((o) => o.id !== outfit.id);
  if (outfits.length >= MAX_OUTFITS) return null;
  return { ...character, outfits: [...outfits, outfit], ...(wear ? { outfitId: outfit.id } : {}) };
}

/** Wear an outfit from now on, or their usual clothes with null. */
export function wearing(character: Character, outfitId: string | null): Character {
  const next = { ...character };
  if (outfitId && outfitsOf(character).some((o) => o.id === outfitId)) next.outfitId = outfitId;
  else delete next.outfitId;
  return next;
}

/** Take an outfit out of the wardrobe (back to usual clothes if it was worn). */
export function withoutOutfit(character: Character, outfitId: string): Character {
  const next: Character = { ...character, outfits: outfitsOf(character).filter((o) => o.id !== outfitId) };
  if (next.outfitId === outfitId) delete next.outfitId;
  return next;
}

/** An outfit with its sheet in one more style. */
export function withOutfitSheet(character: Character, outfitId: string, style: ArtStyleId, sheet: ReferenceSheet): Character {
  return {
    ...character,
    outfits: outfitsOf(character).map((o) => (o.id === outfitId ? { ...o, sheets: { ...o.sheets, [style]: sheet } } : o)),
  };
}

/**
 * Their usual sheet in a style was redrawn: outfit sheets in that style were
 * edits of the old one, so they are dropped and drawn again from the new one
 * when a comic needs them.
 */
export function afterBaseRedraw(character: Character, style: ArtStyleId): Character {
  if (outfitsOf(character).length === 0) return character;
  return {
    ...character,
    outfits: outfitsOf(character).map((o) => {
      if (!o.sheets?.[style]) return o;
      const sheets = { ...o.sheets };
      delete sheets[style];
      return { ...o, sheets };
    }),
  };
}

/** The character with `cost` added to what drawing them has cost. */
export function withCharacterCost(character: Character, cost: CostRecord | null): Character {
  return cost && (cost.usd > 0 || Object.keys(cost.calls).length > 0) ? { ...character, cost: addCosts(character.cost, cost) } : character;
}

/* ---------- Drawing ---------- */

export class OutfitError extends Error {
  name = "OutfitError";
}

/** A sheet image as it crosses the API: a stored Blob or a shipped starter file. */
export async function sheetWire(ref: ImageRef, signal?: AbortSignal): Promise<WireImage | null> {
  try {
    if (ref.kind === "blob") {
      const blob = await getImage(ref.id);
      return blob ? blobToWire(blob) : null;
    }
    const response = await fetch(artAt(ref.path).src, { signal });
    return response.ok ? blobToWire(await response.blob()) : null;
  } catch (error) {
    if (signal?.aborted) throw error;
    return null;
  }
}

/** A photo for the clothes: at most 1536 px, JPEG (which also drops EXIF), like the cast photos. */
async function photoWire(photo: Blob): Promise<WireImage> {
  return blobToWire(photo);
}

export interface DrawnOutfit {
  outfit: Outfit;
  photoRefused: boolean;
  cost: CostRecord | null;
}

/** The style an outfit is first drawn in: the first one the character has a usual sheet for. */
export function firstStyle(character: Character, baseSheet: (style: ArtStyleId) => ReferenceSheet | null, preferred: ArtStyleId = DEFAULT_ART_STYLE): ArtStyleId | null {
  if (baseSheet(preferred)) return preferred;
  for (const style of ["zine", "painterly"] as const) if (baseSheet(style)) return style;
  return null;
}

async function callOutfit(body: OutfitRequest, signal?: AbortSignal, dayId?: string): Promise<{ result: OutfitResponse; cost: CostRecord | null }> {
  let response: Response;
  try {
    response = await fetch("/api/character/outfit", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(dayId ? { "X-Comimo-Day": dayId } : {}) },
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new OutfitError("Couldn't reach Comimo. Check your connection and try again.");
  }
  const result = (await response.json().catch(() => null)) as OutfitResponse | ApiError | null;
  if (!response.ok || !result || !("image" in result)) {
    throw new OutfitError((result as ApiError | null)?.error || `The outfit didn't draw (${response.status}). Try again.`);
  }
  return { result, cost: costFromResponse(response) };
}

async function keepSheet(imageId: string, result: OutfitResponse): Promise<ReferenceSheet> {
  if (!(await putImage(imageId, wireToBlob(result.image)))) {
    throw new OutfitError("Couldn't keep the drawing on this device. Private windows can block storage.");
  }
  const image: ImageRef = { kind: "blob", id: imageId };
  const sheet: ReferenceSheet = { image };
  if (result.sheetToken) sheet.sheetToken = result.sheetToken;
  if (result.fileToken) sheet.file = { token: result.fileToken, sheet: `blob:${imageId}` };
  return sheet;
}

/**
 * A new outfit (not saved yet): their usual sheet in `style` redrawn in the
 * clothes from `photo` (sent once, never kept) and/or `clothes` (typed).
 */
export async function drawNewOutfit(
  character: Character,
  base: ReferenceSheet,
  style: ArtStyleId,
  input: { photo?: Blob | null; clothes?: string },
  signal?: AbortSignal,
): Promise<DrawnOutfit> {
  const sheet = await sheetWire(base.image, signal);
  if (!sheet) throw new OutfitError(`Comimo couldn't open ${character.name}'s sheet on this device. Redraw it from their card first.`);
  const body: OutfitRequest = {
    characterId: character.id,
    name: character.name,
    role: character.role,
    look: character.look,
    style,
    sheet,
    ...(base.sheetToken ? { sheetToken: base.sheetToken } : {}),
    ...(input.clothes?.trim() ? { clothes: input.clothes.trim() } : {}),
    ...(input.photo ? { photo: await photoWire(input.photo), consent: true } : {}),
  };
  const { result, cost } = await callOutfit(body, signal);
  const id = newId();
  const drawn = await keepSheet(`${character.id}-outfit-${id}-${style}`, result);
  return {
    outfit: {
      id,
      ...result.outfit,
      sheets: { [style]: drawn },
      source: input.photo ? "photo" : "description",
      createdAt: new Date().toISOString(),
      ...(cost ? { cost } : {}),
    },
    photoRefused: result.photoRefused === true,
    cost,
  };
}

/**
 * An outfit they already have (from the wardrobe or the day's photos), drawn
 * in another style from their usual sheet in that style. `imageId` names the
 * stored sheet. No photo: the words describe the clothes.
 */
export async function drawOutfitInStyle(
  character: Character,
  outfit: Pick<Outfit, "clothes" | "label" | "look">,
  base: ReferenceSheet,
  style: ArtStyleId,
  imageId: string,
  signal?: AbortSignal,
  dayId?: string,
): Promise<{ sheet: ReferenceSheet; cost: CostRecord | null }> {
  const sheet = await sheetWire(base.image, signal);
  if (!sheet) throw new OutfitError(`Comimo couldn't open ${character.name}'s sheet on this device.`);
  const body: OutfitRequest = {
    characterId: character.id,
    name: character.name,
    role: character.role,
    look: character.look,
    style,
    sheet,
    ...(base.sheetToken ? { sheetToken: base.sheetToken } : {}),
    outfit: { clothes: outfit.clothes, label: outfit.label, look: outfit.look },
  };
  const { result, cost } = await callOutfit(body, signal, dayId);
  return { sheet: await keepSheet(imageId, result), cost };
}
