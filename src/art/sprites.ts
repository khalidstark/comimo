import type { SpriteAnimation, SpriteSheet, SpriteAnimationName } from "@/lib/types";
import { art, type SpriteSheetKey } from "./manifest";

/**
 * Sheet layout for the sprite sheets in the art manifest. Every sheet is a
 * 6 x 4 grid: row 0 idle (breathing), 1 blink, 2 talk, 3 wave. The drawing
 * script (scripts/draw-placeholders.py) and the Muse Image sheets in Phase 4
 * both follow this layout, so swapping the art never touches the player.
 */
export const SHEET_COLUMNS = 6;

const ANIMATIONS: { idle: SpriteAnimation } & Record<Exclude<SpriteAnimationName, "idle">, SpriteAnimation> = {
  idle: { row: 0, frames: 6, fps: 5, loop: true },
  blink: { row: 1, frames: 6, fps: 18, loop: false },
  talk: { row: 2, frames: 6, fps: 10, loop: true },
  wave: { row: 3, frames: 6, fps: 8, loop: false },
};

function sheetFor(key: SpriteSheetKey): SpriteSheet {
  const asset = art.spriteSheets[key];
  return {
    image: { kind: "art", path: `spriteSheets.${key}` },
    frameWidth: asset.width / SHEET_COLUMNS,
    frameHeight: asset.height / 4,
    columns: SHEET_COLUMNS,
    animations: ANIMATIONS,
  };
}

export const spriteSheets: Record<SpriteSheetKey, SpriteSheet> = {
  mascot: sheetFor("mascot"),
  nour: sheetFor("nour"),
  karim: sheetFor("karim"),
  teta: sheetFor("teta"),
  mishmish: sheetFor("mishmish"),
};
