import { describe, expect, it } from "vitest";
import { cleanNewPeople, peopleToOffer } from "./newPeople";

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
