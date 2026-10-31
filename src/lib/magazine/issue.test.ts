import { describe, expect, it } from "vitest";
import { castAppearances, issuePages, mainCast, monthInWords, spreadOf, spreadsFor, type CastInfo, type IssueDayInfo } from "./issue";

const cast: CastInfo[] = [
  { id: "nour", name: "Nour", role: "self" },
  { id: "karim", name: "Karim", role: "friend" },
  { id: "teta", name: "Teta Samia", role: "family" },
  { id: "mishmish", name: "Mishmish", role: "pet" },
];

function day(i: number, mood: IssueDayInfo["mood"], castIds: string[], pageCount = 1): IssueDayInfo {
  return { id: `d${i}`, date: `2026-10-${String(i).padStart(2, "0")}`, title: `Day ${i}`, mood, pageCount, castIds };
}

describe("issuePages", () => {
  it("keeps the inside even so the back cover sits alone", () => {
    for (let n = 1; n <= 24; n++) {
      const days = Array.from({ length: n }, (_, i) => day(i + 1, "sunny", ["nour"], (i % 3) + 1));
      const pages = issuePages(days);
      expect(pages[0].kind).toBe("cover");
      expect(pages.at(-1)!.kind).toBe("back");
      expect((pages.length - 2) % 2).toBe(0);
      const spreads = spreadsFor(pages.length, true);
      expect(spreads[0]).toEqual({ left: null, right: 0 });
      expect(spreads.at(-1)).toEqual({ left: pages.length - 1, right: null });
    }
  });

  it("points every contents entry at its day's first page", () => {
    const days = Array.from({ length: 12 }, (_, i) => day(i + 1, "rainy", ["nour"], i === 2 ? 3 : 1));
    const pages = issuePages(days);
    const contents = pages.filter((page) => page.kind === "contents");
    expect(contents).toHaveLength(2);
    for (const page of contents) {
      if (page.kind !== "contents") continue;
      for (const entry of page.entries) {
        const at = pages[entry.folio - 1];
        expect(at).toEqual({ kind: "comic", dayIndex: entry.dayIndex, page: 0 });
      }
    }
  });
});

describe("spreads", () => {
  it("finds the view that shows a page", () => {
    const spreads = spreadsFor(9, true);
    for (let page = 0; page < 9; page++) {
      const view = spreads[spreadOf(page, true)];
      expect([view.left, view.right]).toContain(page);
    }
    expect(spreadOf(4, false)).toBe(4);
  });
});

describe("the month in words", () => {
  const days = [
    day(1, "rainy", ["nour", "karim"]),
    day(2, "rainy", ["nour", "karim", "teta"]),
    day(3, "sunny", ["nour", "karim"], 2),
    day(4, "cloudy", ["nour"]),
    day(5, "rainy", ["nour", "teta"]),
  ];

  it("counts days, weather and who was there, never a score", () => {
    expect(monthInWords(days, cast)).toEqual([
      "Five days.",
      "Three rainy, one sunny and one cloudy.",
      "Karim was in three, Teta Samia in two.",
      "Six pages of comics.",
    ]);
  });

  it("ranks the cast and puts the narrator first on the cover", () => {
    expect(castAppearances(days, cast).map((entry) => entry.member.id)).toEqual(["nour", "karim", "teta"]);
    expect(mainCast([day(1, "sunny", ["karim", "nour"]), day(2, "sunny", ["karim"])], cast).map((m) => m.id)).toEqual(["nour", "karim"]);
  });

  it("reads naturally for a single day", () => {
    expect(monthInWords([day(1, "stormy", ["nour", "karim"])], cast)).toEqual(["One day.", "Stormy.", "Karim was in it."]);
  });
});
