import { beforeEach, describe, expect, it, vi } from "vitest";
import { starterCastById } from "@/fixtures/cast";
import type { Character } from "./types";

/** An in-memory store standing in for IndexedDB and the account. */
const db = vi.hoisted(() => ({ cast: new Map<string, unknown>(), meta: new Map<string, unknown>() }));

vi.mock("./store", () => ({
  listCast: async () => [...db.cast.values()],
  getMeta: async (key: string) => db.meta.get(key),
  setMeta: async (key: string, value: unknown) => (db.meta.set(key, value), true),
  saveCharacter: async (character: Character) => (db.cast.set(character.id, character), true),
  deleteCharacter: async (id: string) => (db.cast.delete(id), true),
  getCharacter: async (id: string) => db.cast.get(id),
  getImage: async () => undefined,
  putImage: async () => true,
  newId: () => "new-id",
}));

vi.mock("./whoami", () => ({ whoAmI: async () => ({ name: "Salma Adel", cacheKey: "0".repeat(32) }) }));

const { loadCast } = await import("./cast");

beforeEach(() => {
  db.cast.clear();
  db.meta.clear();
});

describe("an account's cast", () => {
  it("starts with only its narrator, under the account's name: the invented friends are for signed-out samples", async () => {
    const cast = await loadCast();
    expect(cast.map((member) => [member.role, member.name])).toEqual([["self", "Salma"]]);
    expect([...db.cast.keys()]).toEqual(["nour"]);
    expect((db.cast.get("nour") as Character).name).toBe("Salma");
    expect(db.meta.get("starterExtrasRemoved")).toBe(true);
  });

  it("takes the untouched invented extras out of a cast seeded with them, and keeps what the user made their own", async () => {
    const self = { ...starterCastById.nour, name: "Khalid" };
    const omar = { ...starterCastById.karim, name: "Omar" };
    const mine: Character = { ...starterCastById.karim, id: "friend-1", name: "Salma", starter: false, createdAt: "2026-11-02T00:00:00.000Z" };
    for (const character of [self, omar, starterCastById.teta, starterCastById.mishmish, mine]) db.cast.set(character.id, character);
    db.meta.set("starterCastSeeded", true);

    const cast = await loadCast();
    expect(cast.map((member) => member.name)).toEqual(["Khalid", "Omar", "Salma"]);
    expect([...db.cast.keys()].sort()).toEqual(["friend-1", "karim", "nour"]);
    expect(db.meta.get("starterExtrasRemoved")).toBe(true);
  });

  it("never brings the extras back to a cast the user emptied", async () => {
    db.meta.set("starterCastSeeded", true);
    db.meta.set("starterExtrasRemoved", true);
    expect(await loadCast()).toEqual([]);
  });
});
