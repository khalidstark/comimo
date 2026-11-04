import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Character, CharacterSheetResponse, ImageRef } from "./types";

/** Redrawing a sheet: the new picture gets a new version, and a sprite made from the old one goes. */

const db = vi.hoisted(() => ({ cast: new Map<string, unknown>() }));

vi.mock("./store", () => ({
  listCast: async () => [...db.cast.values()],
  getMeta: async () => undefined,
  setMeta: async () => true,
  isSynced: async () => true,
  saveCharacter: async (character: Character) => (db.cast.set(character.id, character), true),
  deleteCharacter: async (id: string) => (db.cast.delete(id), true),
  getCharacter: async (id: string) => db.cast.get(id),
  getImage: async () => undefined,
  putImage: async () => true,
  newId: () => "new-id",
}));

vi.mock("./whoami", () => ({ whoAmI: async () => null }));

const { drawReferenceSheet } = await import("./cast");

const blob = (id: string, v?: string): ImageRef => ({ kind: "blob", id, ...(v ? { v } : {}) });

const omar: Character = {
  id: "omar",
  name: "Omar",
  role: "friend",
  roleLabel: "Friend",
  look: "Tall, curly hair, round glasses, green hoodie",
  personality: "",
  portrait: blob("omar-portrait", "a"),
  referenceSheets: {
    zine: { image: blob("omar-sheet-zine", "a"), sheetToken: "zine-1" },
    painterly: { image: blob("omar-sheet-painterly", "a"), sheetToken: "painterly-1" },
  },
  spriteSheet: { image: blob("omar-sprite", "a"), frameWidth: 256, frameHeight: 256, columns: 6, animations: {} as never },
  starter: false,
  createdAt: "2026-11-01T00:00:00.000Z",
};

beforeEach(() => {
  db.cast.clear();
  db.cast.set(omar.id, omar);
  const body: CharacterSheetResponse = { mode: "mock", image: { mimeType: "image/png", base64: "AAAA" }, sheetToken: "new-token", fileToken: null };
  vi.stubGlobal("fetch", async () => Response.json(body));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("redrawing a sheet", () => {
  it("gives the new picture a new version and lets go of the sprite made from the old one", async () => {
    const drawn = await drawReferenceSheet(omar, "zine");
    const image = drawn.referenceSheets?.zine?.image;
    expect(image).toMatchObject({ kind: "blob", id: "omar-sheet-zine" });
    expect(image?.kind === "blob" && image.v).not.toBe("a");
    expect(drawn.spriteSheet).toBeNull();
    expect(drawn.portrait).toEqual({ kind: "art", path: "empty.cast" });
  });

  it("keeps a sprite that was made from the other style's sheet", async () => {
    const drawn = await drawReferenceSheet(omar, "painterly");
    expect(drawn.spriteSheet).toEqual(omar.spriteSheet);
    expect(drawn.portrait).toEqual(omar.portrait);
  });
});
