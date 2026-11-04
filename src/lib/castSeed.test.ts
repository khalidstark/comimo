import { beforeEach, describe, expect, it, vi } from "vitest";
import { starterCastById } from "@/fixtures/cast";
import type { Character } from "./types";

/** An in-memory store standing in for IndexedDB and the account. */
const db = vi.hoisted(() => ({ cast: new Map<string, unknown>(), meta: new Map<string, unknown>(), synced: true }));

const NOW = "2026-11-04T12:00:00.000Z";

vi.mock("./store", () => ({
  listCast: async () => [...db.cast.values()],
  getMeta: async (key: string) => db.meta.get(key),
  setMeta: async (key: string, value: unknown) => (db.meta.set(key, value), true),
  isSynced: async () => db.synced,
  // Like the real store: stamped now, unless the stamp is kept.
  saveCharacter: async (character: Character, options: { keepStamp?: boolean } = {}) => (
    db.cast.set(character.id, { ...character, updatedAt: options.keepStamp ? (character.updatedAt ?? character.createdAt) : NOW }),
    true
  ),
  deleteCharacter: async (id: string) => (db.cast.delete(id), true),
  getCharacter: async (id: string) => db.cast.get(id),
  getImage: async () => undefined,
  putImage: async () => true,
  newId: () => "new-id",
}));

vi.mock("./whoami", () => ({ whoAmI: async () => ({ name: "Salma Adel", cacheKey: "0".repeat(32) }) }));

const { castName, draftFrom, loadCast, validateDraft } = await import("./cast");

beforeEach(() => {
  db.cast.clear();
  db.meta.clear();
  db.synced = true;
});

describe("an account's cast", () => {
  it("starts with only its narrator, under the account's name: the invented friends are for signed-out samples", async () => {
    const cast = await loadCast();
    expect(cast.map((member) => [member.role, member.name])).toEqual([["self", "Salma"]]);
    expect([...db.cast.keys()]).toEqual(["nour"]);
    expect((db.cast.get("nour") as Character).name).toBe("Salma");
    expect(db.meta.get("starterExtrasRemoved")).toBe(true);
  });

  it("seeds the narrator older than anything, so the account's own copy wins the next sync", async () => {
    await loadCast();
    expect((db.cast.get("nour") as Character).updatedAt).toBe("1970-01-01T00:00:00.000Z");
  });

  it("writes nothing while a new device hasn't heard from the account yet", async () => {
    db.synced = false;
    const cast = await loadCast();
    expect(cast.map((member) => [member.role, member.name])).toEqual([["self", "Salma"]]);
    expect(db.cast.size).toBe(0);
    expect(db.meta.get("starterCastSeeded")).toBeUndefined();
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

describe("a sign-up name as a cast name", () => {
  it("keeps what a cast name takes, so About you's last step accepts it", () => {
    expect(castName("Sara_99")).toBe("Sara 99");
    expect(castName("  Salma   Adel ")).toBe("Salma Adel");
    expect(castName("نور 🌙")).toBe("نور");
    expect(castName("___")).toBe("");
    const long = "Mohamed Abdelrahman Abdelaziz Elsayed";
    expect(castName(long)).toBe("Mohamed Abdelrahman Abdelaziz");
    for (const raw of ["Sara_99", long, "Ana-María O'Neil"]) {
      expect(validateDraft({ ...draftFrom(), name: castName(raw), look: "Short dark hair and a green coat" }, []).name).toBeUndefined();
    }
  });
});
