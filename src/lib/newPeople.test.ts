import { describe, expect, it } from "vitest";
import { applyFaceChoices, cleanNewPeople, peopleToOffer, remapPanel, resolveNewPeople } from "./newPeople";
import type { ComicScript } from "./types";

const cast = [
  { id: "nour", name: "Nour", aliases: ["نور"] },
  { id: "teta", name: "Teta Samia", aliases: ["Teta", "تيتا"] },
];

describe("cleanNewPeople", () => {
  it("keeps named new people and drops cast members, duplicates and junk", () => {
    const people = cleanNewPeople(
      [
        { name: "Omar", mentionedAs: ["Omar", "عمر", "omar"], role: "friend", look: "denim jacket" },
        { name: "تيتا", mentionedAs: ["تيتا"], role: "family", look: "" },
        { name: "omar", mentionedAs: [], role: "friend", look: "" },
        { name: "<b>", mentionedAs: [], role: "friend", look: "" },
        { name: "Laila", mentionedAs: ["Laila"], role: "boss", look: "" },
      ],
      cast,
    );
    expect(people).toEqual([
      { name: "Omar", mentionedAs: ["Omar", "عمر"], role: "friend", look: "denim jacket" },
      { name: "Laila", mentionedAs: ["Laila"], role: "friend", look: "" },
    ]);
  });

  it("returns nothing for a missing list", () => {
    expect(cleanNewPeople(undefined, cast)).toEqual([]);
  });
});

describe("peopleToOffer", () => {
  const omar = { name: "Omar", mentionedAs: ["Omar", "عمر"], role: "friend" as const, look: "" };
  it("skips declined names and people added since", () => {
    expect(peopleToOffer([omar], cast, new Set())).toEqual([omar]);
    expect(peopleToOffer([omar], cast, new Set(["omar"]))).toEqual([]);
    expect(peopleToOffer([omar], [...cast, { id: "o", name: "Omar Adel", aliases: ["عمر"] }], new Set())).toEqual([]);
  });
});

describe("resolveNewPeople (03-06)", () => {
  it("keeps placeholders for new people, maps a missed alias to the cast id, merges twins and drops junk", () => {
    const { people, ids } = resolveNewPeople(
      [
        { id: "new1", name: "Omar", named: true, mentionedAs: ["Omar"], role: "friend", look: "" },
        { id: "new2", name: "the cashier", named: false, mentionedAs: ["cashier"], role: "other", look: "green apron" },
        { id: "new3", name: "تيتا", named: true, mentionedAs: [], role: "family", look: "" },
        { id: "new4", name: "omar", named: true, mentionedAs: [], role: "friend", look: "" },
      ],
      cast,
    );
    expect(people.map((p) => [p.id, p.name, p.named])).toEqual([
      ["new1", "Omar", undefined],
      ["new2", "the cashier", false],
    ]);
    expect(Object.fromEntries(ids)).toEqual({ new1: "new1", new2: "new2", new3: "teta", new4: "new1" });
  });
});

describe("applyFaceChoices (03-06)", () => {
  const script: ComicScript = {
    title: "Rush hour",
    mood: "cloudy",
    heavy: false,
    checkInQuestions: [],
    safety: "ok",
    panels: [
      { index: 0, scene: "Nour and Omar at the till.", dialogue: [{ speakerId: "new1", text: "Hi!", dir: "ltr" }], characterIds: ["nour", "new1"] },
      { index: 1, scene: "The cashier frowns.", dialogue: [{ speakerId: "new2", text: "Next!", dir: "ltr" }], characterIds: ["new2", "nour", "new3"] },
      { index: 2, scene: "Omar waves.", dialogue: [], characterIds: ["new1", "new2"] },
    ],
    newPeople: [
      { id: "new1", name: "Omar", mentionedAs: ["Omar"], role: "friend", look: "" },
      { id: "new2", name: "the cashier", named: false, mentionedAs: ["cashier"], role: "other", look: "" },
    ],
  };

  it("swaps placeholders for the new cast id and one-off ids, and drops unknown ones", () => {
    const settled = applyFaceChoices(script, { new1: { kind: "cast", characterId: "omar-id", name: "Omar" }, new2: { kind: "oneoff" } });
    expect(settled.panels.map((p) => p.characterIds)).toEqual([["nour", "omar-id"], ["oneoff:new2", "nour"], ["omar-id", "oneoff:new2"]]);
    expect(settled.panels[0].dialogue[0].speakerId).toBe("omar-id");
    expect(settled.panels[1].dialogue[0].speakerId).toBe("oneoff:new2");
    expect(settled.oneOffs).toEqual([{ id: "oneoff:new2", name: "the cashier", look: "", role: "other" }]);
    expect(settled.newPeople).toBeUndefined();
  });

  it("keeps skipped people to offer after the comic, drawn as one-offs today", () => {
    const settled = applyFaceChoices(script, { new2: { kind: "never" } });
    expect(settled.oneOffs?.map((o) => o.id)).toEqual(["oneoff:new1", "oneoff:new2"]);
    expect(settled.newPeople?.map((p) => p.name)).toEqual(["Omar"]);
  });
});

describe("remapPanel", () => {
  it("drops lines whose speaker is gone and keeps at most three characters", () => {
    const panel = remapPanel(
      { characterIds: ["a", "b", "c", "d"], dialogue: [{ speakerId: "b", text: "x", dir: "ltr" as const }] },
      (id) => (id === "b" ? null : id),
    );
    expect(panel).toEqual({ characterIds: ["a", "c", "d"], dialogue: [] });
  });
});
