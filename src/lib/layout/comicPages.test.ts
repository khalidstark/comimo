import { describe, expect, it } from "vitest";
import { applyStoryMode } from "../models/storyMode";
import type { ScriptPanel, Shot } from "../types";
import { layoutPages, pageLayoutChain, pagesFromNumbers, splitPages } from "./comicPages";
import { resolveLayout } from "./pickLayout";

function panel(index: number, extra: Partial<ScriptPanel> = {}): ScriptPanel {
  const shots: Shot[] = ["establishing", "medium", "closeup", "wide", "detail", "medium"];
  return { index, scene: `Scene ${index}`, dialogue: [], characterIds: ["nour"], shot: shots[index % 6], beat: "build", ...extra };
}

describe("pages from the script's page numbers", () => {
  it("groups panels by page when every page has 4 to 6", () => {
    expect(pagesFromNumbers([1, 1, 1, 1, 2, 2, 2, 2, 2])).toEqual([
      [0, 1, 2, 3],
      [4, 5, 6, 7, 8],
    ]);
  });

  it("splits evenly when the numbers don't make valid pages", () => {
    expect(pagesFromNumbers([1, 1, 1, 1, 1, 1, 1, 1, 2, 2])).toEqual([
      [0, 1, 2, 3, 4],
      [5, 6, 7, 8, 9],
    ]);
    expect(pagesFromNumbers([2, 1, 1, 1, 1])).toEqual([[0, 1, 2, 3, 4]]);
  });

  it("refuses counts no pages can hold", () => {
    expect(pagesFromNumbers([1, 1, 1])).toBeNull();
    expect(pagesFromNumbers([1, 1, 1, 1, 1, 1, 1])).toBeNull();
    expect(pagesFromNumbers(Array.from({ length: 19 }, () => 3))).toBeNull();
  });
});

describe("laying out a multi-page comic", () => {
  const panels = Array.from({ length: 15 }, (_, i) => panel(i));
  const pages = [{ panels: [0, 1, 2, 3, 4] }, { panels: [5, 6, 7, 8, 9, 10] }, { panels: [11, 12, 13, 14] }];

  it("gives each page one splash and a template different from the page before", () => {
    const result = layoutPages(panels, pages, "day-x", "turn-5");
    expect(result.pages.map((page) => page.panels)).toEqual(pages.map((page) => page.panels));
    let previous = "turn-5";
    for (const slice of result.slices) {
      expect(slice.panels.filter((p) => p.shot === "splash")).toHaveLength(1);
      expect(slice.layout).not.toBeNull();
      expect(resolveLayout(slice.layout, slice.panels.length).fallback).toBe(false);
      expect(slice.layout!.template).not.toBe(previous);
      previous = slice.layout!.template;
    }
  });

  it("keeps panel indexes global and seeds page one with the day id", () => {
    const slices = splitPages(panels, pages, "day-x");
    expect(slices[1].panels[0].index).toBe(5);
    expect(slices[0].seed).toBe("day-x");
    expect(slices[2].seed).toBe("day-x:p3");
  });

  it("reads a day made before pages as a single page", () => {
    const slices = splitPages(panels.slice(0, 5), undefined, "old", { template: "vista-5", focus: 0 });
    expect(slices).toHaveLength(1);
    expect(slices[0].layout).toEqual({ template: "vista-5", focus: 0 });
  });

  it("never repeats a template on consecutive pages across days", () => {
    const days = [0, 1, 2].map((d) => ({
      id: `d${d}`,
      date: `2026-10-0${d + 1}`,
      createdAt: `2026-10-0${d + 1}T09:00:00Z`,
      panels: Array.from({ length: 10 }, (_, i) => panel(i)),
      pages: [{ panels: [0, 1, 2, 3, 4] }, { panels: [5, 6, 7, 8, 9] }],
    }));
    const chain = pageLayoutChain(days);
    const sequence = days.flatMap((day) => chain.get(day.id)!.map((choice) => choice!.template));
    for (let i = 1; i < sequence.length; i++) expect(sequence[i]).not.toBe(sequence[i - 1]);
  });
});

describe("story modes", () => {
  const script = [
    panel(0, { narration: "It was late.", caption: "Night.", dialogue: [{ speakerId: "nour", text: "Hi", dir: "ltr" }] }),
    panel(1, { narration: "Then he spoke.", dialogue: [{ speakerId: "nour", text: "Yo", dir: "ltr" }] }),
    panel(2, { caption: "Later." }),
    panel(3, { narration: "I smiled." }),
  ];

  it("drops narration in Dialogue mode", () => {
    const out = applyStoryMode(script, [[0, 1, 2, 3]], "dialogue");
    expect(out.every((p) => p.narration === undefined)).toBe(true);
    expect(out[0].caption).toBe("Night.");
  });

  it("keeps at most one spoken line per page in Narrated mode", () => {
    const out = applyStoryMode(script, [[0, 1, 2, 3]], "narrated");
    expect(out.flatMap((p) => p.dialogue)).toHaveLength(1);
  });

  it("lets narration replace the caption in Both mode", () => {
    const out = applyStoryMode(script, [[0, 1, 2, 3]], "both");
    expect(out[0].caption).toBeUndefined();
    expect(out[2].caption).toBe("Later.");
    expect(out.flatMap((p) => p.dialogue)).toHaveLength(2);
  });
});
