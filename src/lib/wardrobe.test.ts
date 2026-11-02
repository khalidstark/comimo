import { describe, expect, it } from "vitest";
import { starterCastById } from "@/fixtures/cast";
import { peopleWorthALook, pickMatches } from "@/lib/models/outfitPick";
import { outfitFrom } from "@/lib/models/meta/outfit";
import { wornFileTokenFor, wornSheetFor, withWornFile } from "./cast";
import { MAX_OUTFITS, type Character, type DayOutfit, type Outfit } from "./types";
import { afterBaseRedraw, lookFor, wearing, withOutfit, withoutOutfit, wornOutfit } from "./wardrobe";

const sheet = (id: string, token?: string) => ({ image: { kind: "blob" as const, id }, ...(token ? { file: { token, sheet: `blob:${id}` } } : {}) });

const you: Character = {
  ...starterCastById.nour,
  id: "you",
  starter: false,
  look: "Woman with curly dark hair and round glasses, mustard cardigan over a navy T-shirt.",
  referenceSheets: { zine: sheet("you-sheet-zine", "file-base.tok") },
};

const raincoat: Outfit = {
  id: "o1",
  label: "Olive raincoat",
  clothes: "Long olive raincoat, yellow rain boots",
  look: "Woman with curly dark hair and round glasses, long olive raincoat, yellow rain boots.",
  sheets: { zine: sheet("you-outfit-o1-zine") },
  source: "description",
  createdAt: "2026-11-02T10:00:00.000Z",
};

const today: DayOutfit = {
  characterId: "you",
  label: "Denim jacket",
  clothes: "Denim jacket, white T-shirt",
  look: "Woman with curly dark hair and round glasses, denim jacket over a white T-shirt.",
  sheets: { zine: sheet("day1-outfit-you-zine") },
  photo: 0,
};

describe("wardrobe", () => {
  it("wears usual clothes until an outfit is chosen, and old records have no wardrobe", () => {
    expect(wornOutfit(you)).toBeNull();
    expect(lookFor(you)).toBe(you.look);
    expect(wornSheetFor(you, "zine").sheet?.image).toEqual({ kind: "blob", id: "you-sheet-zine" });
    expect(wornFileTokenFor(you, "zine")).toBe("file-base.tok");
  });

  it("draws new comics in the chosen outfit; the day's photos win over it", () => {
    const dressed = withOutfit(you, raincoat, true)!;
    expect(wornOutfit(dressed)?.id).toBe("o1");
    expect(lookFor(dressed)).toBe(raincoat.look);
    expect(wornSheetFor(dressed, "zine")).toMatchObject({ sheet: raincoat.sheets.zine, missing: false, wearing: { kind: "outfit" } });
    // Not uploaded yet: no token, so the panel sends the outfit sheet itself.
    expect(wornFileTokenFor(dressed, "zine")).toBeUndefined();
    // Painterly isn't drawn in this outfit: panels fall back to the usual sheet (none here) and say it's missing.
    expect(wornSheetFor(dressed, "painterly")).toMatchObject({ sheet: null, missing: true });
    expect(lookFor(dressed, [today])).toBe(today.look);
    expect(wornSheetFor(dressed, "zine", [today]).sheet?.image).toEqual({ kind: "blob", id: "day1-outfit-you-zine" });
  });

  it("keeps the uploaded token on the sheet that was used", () => {
    const dressed = withOutfit(you, raincoat, true)!;
    const uploaded = withWornFile(dressed, "zine", "file-outfit.tok");
    expect(wornFileTokenFor(uploaded, "zine")).toBe("file-outfit.tok");
    // The usual sheet's token is untouched.
    expect(uploaded.referenceSheets?.zine?.file?.token).toBe("file-base.tok");
    // A day outfit's token lives on the day: the character doesn't change.
    expect(withWornFile(dressed, "zine", "file-day.tok", [today])).toBe(dressed);
  });

  it("switches, deletes and caps the wardrobe", () => {
    let dressed = withOutfit(you, raincoat, true)!;
    dressed = wearing(dressed, null);
    expect(wornOutfit(dressed)).toBeNull();
    dressed = wearing(dressed, "o1");
    dressed = withoutOutfit(dressed, "o1");
    expect(dressed.outfits).toEqual([]);
    expect(dressed.outfitId).toBeUndefined();
    let full: Character = you;
    for (let i = 0; i < MAX_OUTFITS; i++) full = withOutfit(full, { ...raincoat, id: `o${i}` }, false)!;
    expect(withOutfit(full, { ...raincoat, id: "one-more" }, false)).toBeNull();
  });

  it("drops outfit sheets of a style when the usual sheet is redrawn", () => {
    const dressed = withOutfit(you, raincoat, true)!;
    const redrawn = afterBaseRedraw(dressed, "zine");
    expect(redrawn.outfits?.[0].sheets.zine).toBeUndefined();
    expect(wornSheetFor(redrawn, "zine")).toMatchObject({ sheet: you.referenceSheets!.zine, missing: true });
    expect(afterBaseRedraw(dressed, "painterly")).toEqual(dressed);
  });
});

describe("today's outfit picks", () => {
  it("looks only at clear, big enough people, biggest first", () => {
    const people = [
      { x1: 0, y1: 0, x2: 10, y2: 10, score: 0.9 },
      { x1: 0, y1: 0, x2: 400, y2: 800, score: 0.95 },
      { x1: 0, y1: 0, x2: 300, y2: 600, score: 0.3 },
      { x1: 0, y1: 0, x2: 200, y2: 500, score: 0.8 },
    ];
    expect(peopleWorthALook(people, 1000, 1000).map((p) => p.x2)).toEqual([400, 200]);
  });

  it("dresses each character once, from their surest match, narrator first, at most three", () => {
    const m = (crop: number, characterId: string, confidence: number) => ({ crop, characterId, confidence, clothes: "x jacket", label: "x", look: "x" });
    const picked = pickMatches([m(0, "friend", 0.9), m(1, "you", 0.8), m(2, "you", 0.95), m(3, "teta", 0.5), m(4, "a", 0.9), m(5, "b", 0.9)], ["you", "friend", "teta", "a", "b"]);
    expect(picked.map((p) => [p.characterId, p.crop])).toEqual([["you", 2], ["friend", 0], ["a", 4]]);
  });

  it("keeps clothes words free of anything about who the person is", () => {
    const base = "Woman with curly dark hair and round glasses, mustard cardigan.";
    expect(outfitFrom({ clothes: "Green parka, black jeans", label: "Green parka", look: "Woman with curly dark hair and round glasses. She has olive skin. Green parka, black jeans." }, base)).toEqual({
      clothes: "Green parka, black jeans",
      label: "Green parka",
      look: "Woman with curly dark hair and round glasses. Green parka, black jeans.",
    });
    expect(outfitFrom({ clothes: "", label: "", look: "" }, base)).toBeNull();
    // A look that came back empty keeps the old one with the clothes added.
    expect(outfitFrom({ clothes: "Green parka, black jeans", label: "", look: "" }, base)?.look).toBe(`${base} Now wearing: Green parka, black jeans.`);
  });
});
