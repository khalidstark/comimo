import type { SpriteAnimation, SpriteAnimationName, SpriteSheet } from "@/lib/types";
import { art, type ArtAsset, type SpriteSheetKey } from "./manifest";

/** How a sheet is cut: its grid, and which row plays which animation. */
export interface SpriteLayout {
  columns: number;
  rows: number;
  animations: SpriteSheet["animations"];
}

/**
 * Muse sheets: a 6 x 4 grid, row 0 idle (breathing), 1 blink, 2 talk, 3 wave.
 * The Muse Image sheets drawn at runtime for the user's own people
 * (src/lib/sprites/assemble.ts) and the first site sheets follow it.
 */
export const MUSE_LAYOUT = {
  columns: 6,
  rows: 4,
  animations: {
    idle: { row: 0, frames: 6, fps: 5, loop: true },
    blink: { row: 1, frames: 6, fps: 18, loop: false },
    talk: { row: 2, frames: 6, fps: 10, loop: true },
    wave: { row: 3, frames: 6, fps: 8, loop: false },
  },
} as const satisfies SpriteLayout;

/**
 * The smooth site sheets, made once at design time from the Muse art (design/): a 12 x 3 grid,
 * row 0 idle and row 1 talk (both ping-ponged, so they loop without a jump), row 2 a wave that
 * starts and ends at rest. No blink row: the smooth idle already has life in it.
 */
export const HF_LAYOUT = {
  columns: 12,
  rows: 3,
  animations: {
    idle: { row: 0, frames: 12, fps: 9, loop: true },
    talk: { row: 1, frames: 12, fps: 11, loop: true },
    wave: { row: 2, frames: 12, fps: 11, loop: false },
  },
} as const satisfies SpriteLayout;

/** The Muse layout's grid and animations, for sheets drawn at runtime. */
export const SHEET_COLUMNS = MUSE_LAYOUT.columns;
export const ANIMATIONS: { idle: SpriteAnimation } & Record<Exclude<SpriteAnimationName, "idle">, SpriteAnimation> =
  MUSE_LAYOUT.animations;

function sheetOf(asset: ArtAsset, path: `spriteSheets.${SpriteSheetKey}` | `spriteSheetsHf.${SpriteSheetKey}`, layout: SpriteLayout): SpriteSheet {
  return {
    image: { kind: "art", path },
    frameWidth: asset.width / layout.columns,
    frameHeight: asset.height / layout.rows,
    columns: layout.columns,
    rows: layout.rows,
    animations: layout.animations,
  };
}

const KEYS = Object.keys(art.spriteSheets) as SpriteSheetKey[];

/** The first site sheets (Muse, 6 x 4). Stored records still point at these. */
export const museSpriteSheets = Object.fromEntries(
  KEYS.map((key) => [key, sheetOf(art.spriteSheets[key], `spriteSheets.${key}`, MUSE_LAYOUT)]),
) as Record<SpriteSheetKey, SpriteSheet>;

/** The smooth sheet for a site character, or its Muse sheet while it has none. */
function siteSheetFor(key: SpriteSheetKey): SpriteSheet {
  const smooth = (art.spriteSheetsHf as Partial<Record<SpriteSheetKey, ArtAsset>>)[key];
  return smooth ? sheetOf(smooth, `spriteSheetsHf.${key}`, HF_LAYOUT) : museSpriteSheets[key];
}

/** What Mimo and the starter cast play. */
export const spriteSheets = Object.fromEntries(KEYS.map((key) => [key, siteSheetFor(key)])) as Record<SpriteSheetKey, SpriteSheet>;

const SITE_PATH = /^spriteSheets(?:Hf)?\.(\w+)$/;

/**
 * The sheet to play. A site character's sheet is looked up again by its art path, so a record
 * stored with an older site sheet (and its older grid) plays today's one; a user's own sheet,
 * drawn at runtime, is played as it is.
 */
export function playableSheet(sheet: SpriteSheet): SpriteSheet {
  if (sheet.image.kind !== "art") return sheet;
  const key = SITE_PATH.exec(sheet.image.path)?.[1];
  return key && key in spriteSheets ? spriteSheets[key as SpriteSheetKey] : sheet;
}
