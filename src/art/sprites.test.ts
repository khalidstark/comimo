import { describe, expect, it } from "vitest";
import { starterCast } from "@/fixtures/cast";
import type { SpriteSheet } from "@/lib/types";
import { artAt } from "./manifest";
import { ANIMATIONS, HF_LAYOUT, MUSE_LAYOUT, museSpriteSheets, playableSheet, spriteSheets } from "./sprites";

const registered: [string, SpriteSheet][] = [
  ...Object.entries(spriteSheets).map(([key, sheet]): [string, SpriteSheet] => [`site ${key}`, sheet]),
  ...Object.entries(museSpriteSheets).map(([key, sheet]): [string, SpriteSheet] => [`muse ${key}`, sheet]),
];

function imageOf(sheet: SpriteSheet) {
  if (sheet.image.kind !== "art") throw new Error("registered sheets are manifest art");
  return artAt(sheet.image.path);
}

describe("registered sprite sheets", () => {
  it.each(registered)("%s: the frame grid divides the image exactly", (_, sheet) => {
    const { width, height } = imageOf(sheet);
    const rows = sheet.rows ?? 0;
    expect(rows).toBeGreaterThan(0);
    expect(Number.isInteger(sheet.frameWidth)).toBe(true);
    expect(Number.isInteger(sheet.frameHeight)).toBe(true);
    expect(sheet.frameWidth * sheet.columns).toBe(width);
    expect(sheet.frameHeight * rows).toBe(height);
  });

  it.each(registered)("%s: every animation fits its row and the image", (_, sheet) => {
    const rows = imageOf(sheet).height / sheet.frameHeight;
    for (const animation of Object.values(sheet.animations)) {
      if (!animation) continue;
      expect(animation.frames).toBeGreaterThan(0);
      expect(animation.frames).toBeLessThanOrEqual(sheet.columns);
      expect(animation.row).toBeGreaterThanOrEqual(0);
      expect(animation.row).toBeLessThan(rows);
      expect(animation.fps).toBeGreaterThan(0);
    }
  });

  it("plays the smooth 12 x 3 sheets for Mimo and the starter cast", () => {
    for (const sheet of Object.values(spriteSheets)) {
      expect(sheet.columns).toBe(HF_LAYOUT.columns);
      expect(sheet.rows).toBe(HF_LAYOUT.rows);
      expect(sheet.animations.blink).toBeUndefined();
      expect(sheet.animations.wave?.loop).toBe(false);
      expect(sheet.image).toMatchObject({ kind: "art", path: expect.stringMatching(/^spriteSheetsHf\./) });
    }
  });

  it("keeps the 6 x 4 layout for sheets drawn at runtime", () => {
    expect(MUSE_LAYOUT.columns).toBe(6);
    expect(MUSE_LAYOUT.rows).toBe(4);
    expect(ANIMATIONS).toBe(MUSE_LAYOUT.animations);
    expect(Object.keys(ANIMATIONS).sort()).toEqual(["blink", "idle", "talk", "wave"]);
  });
});

describe("playableSheet", () => {
  it("swaps a stored site sheet for the one the character plays today", () => {
    const stored = starterCast.find((c) => c.id === "karim")?.spriteSheet;
    expect(stored).toBeTruthy();
    expect(playableSheet(stored!)).toBe(spriteSheets.karim);
    expect(playableSheet(museSpriteSheets.mascot)).toBe(spriteSheets.mascot);
    expect(playableSheet(spriteSheets.teta)).toBe(spriteSheets.teta);
  });

  it("plays a user's own runtime sheet as it is", () => {
    const own: SpriteSheet = {
      image: { kind: "blob", id: "someone-sprite" },
      frameWidth: 256,
      frameHeight: 320,
      columns: 6,
      animations: ANIMATIONS,
    };
    expect(playableSheet(own)).toBe(own);
  });

  it("leaves other manifest art alone", () => {
    const other: SpriteSheet = { ...museSpriteSheets.nour, image: { kind: "art", path: "sprites.nour" } };
    expect(playableSheet(other)).toBe(other);
  });
});
