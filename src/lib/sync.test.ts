import { describe, expect, it } from "vitest";
import { blobIdsIn, imagesToPush, isSyncedMetaKey, planMeta, planRecords } from "./sync";

const T = (h: number) => `2026-10-31T${String(h).padStart(2, "0")}:00:00.000Z`;

function side(records: [string, string][], tombstones: [string, string][] = []) {
  return { records: new Map(records), tombstones: new Map(tombstones) };
}

describe("planRecords", () => {
  it("pulls what only the server has and pushes what only this device has", () => {
    const plan = planRecords(side([["mine", T(1)]]), { theirs: { u: T(1) } });
    expect(plan.pull).toEqual(["theirs"]);
    expect(plan.push).toEqual(["mine"]);
  });

  it("lets the newer copy win and leaves equal copies alone", () => {
    const plan = planRecords(side([["a", T(2)], ["b", T(1)], ["c", T(3)]]), { a: { u: T(1) }, b: { u: T(2) }, c: { u: "2026-10-31T03:00:00Z" } });
    expect(plan.push).toEqual(["a"]);
    expect(plan.pull).toEqual(["b"]);
  });

  it("drops a copy deleted elsewhere, unless it was edited here after the deletion", () => {
    const plan = planRecords(side([["old", T(1)], ["edited", T(5)]]), { old: { u: T(2), d: 1 }, edited: { u: T(2), d: 1 } });
    expect(plan.drop).toEqual(["old"]);
    expect(plan.push).toEqual(["edited"]);
  });

  it("sends a deletion made here, unless the server's copy is newer", () => {
    const plan = planRecords(side([], [["gone", T(3)], ["revived", T(1)], ["never", T(1)]]), { gone: { u: T(2) }, revived: { u: T(4) } });
    expect(plan.deleteRemote).toEqual([["gone", T(3)]]);
    expect(plan.pull).toEqual(["revived"]);
    expect(plan.forget.sort()).toEqual(["never", "revived"]);
  });

  it("ignores server tombstones for records this device never had", () => {
    expect(planRecords(side([]), { x: { u: T(1), d: 1 } })).toEqual({ pull: [], push: [], drop: [], deleteRemote: [], forget: [] });
  });
});

describe("settings, images and refs", () => {
  it("syncs settings by stamp", () => {
    expect(planMeta(new Map([["cover:2026-10", T(2)], ["newPeople:never", T(1)]]), { "cover:2026-10": T(1), starterCastSeeded: T(1), "newPeople:never": T(3) })).toEqual({
      pull: ["newPeople:never", "starterCastSeeded"],
      push: ["cover:2026-10"],
    });
  });

  it("pushes only images the server lacks", () => {
    expect(imagesToPush(["a", "b", "c"], ["b"])).toEqual(["a", "c"]);
  });

  it("finds every blob a record points at", () => {
    const day = { panels: [{ image: { kind: "blob", id: "d-panel-0" }, consistency: { beforeImage: { kind: "blob", id: "d-panel-0-before" } } }, { image: { kind: "art", path: "x" } }] };
    expect([...blobIdsIn(day)].sort()).toEqual(["d-panel-0", "d-panel-0-before"]);
  });
});

describe("synced settings", () => {
  it("keeps the About-you flag with the account, on both sides", async () => {
    const server = await import("./server/library");
    for (const key of ["aboutYou:asked", "starterCastSeeded", "newPeople:never", "cover:2026-11"]) {
      expect(isSyncedMetaKey(key)).toBe(true);
      expect(server.isSyncedMetaKey(key)).toBe(true);
    }
    expect(isSyncedMetaKey("aboutYou:other")).toBe(false);
    expect(server.isSyncedMetaKey("aboutYou:other")).toBe(false);
  });
});
