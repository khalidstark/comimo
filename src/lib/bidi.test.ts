import { describe, expect, it } from "vitest";
import { firstStrongDir, splitBidiRuns } from "./bidi";

describe("splitBidiRuns", () => {
  it("returns one run for single-direction text", () => {
    expect(splitBidiRuns("hello there")).toEqual([{ text: "hello there", dir: "ltr" }]);
    expect(splitBidiRuns("مش هلحق")).toEqual([{ text: "مش هلحق", dir: "rtl" }]);
  });

  it("keeps punctuation with the words it follows", () => {
    expect(splitBidiRuns("I won't make it, مش هلحق")).toEqual([
      { text: "I won't make it,", dir: "ltr" },
      { text: " ", dir: null },
      { text: "مش هلحق", dir: "rtl" },
    ]);
  });

  it("splits right before the new run when there is no space", () => {
    expect(splitBidiRuns("الـreport")).toEqual([
      { text: "الـ", dir: "rtl" },
      { text: "report", dir: "ltr" },
    ]);
  });

  it("returns no runs for empty text", () => {
    expect(splitBidiRuns("")).toEqual([]);
  });
});

describe("firstStrongDir", () => {
  it("skips neutrals to find the first strong character", () => {
    expect(firstStrongDir("123 ... مرحبا")).toBe("rtl");
    expect(firstStrongDir("... hello")).toBe("ltr");
  });

  it("returns null when there is no letter", () => {
    expect(firstStrongDir("12 !?")).toBeNull();
  });
});
