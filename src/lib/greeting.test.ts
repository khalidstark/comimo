import { describe, expect, it } from "vitest";
import { HOW_TO, NEW_USER_COMICS, PROMPTS, greeting, partOfDay, promptsFor } from "./greeting";

const base = { name: "Khalid Osama", hour: 20, dateKey: "2026-11-01", comics: 10, madeToday: false };

describe("greeting", () => {
  it("greets by first name and drops the how-to line for regulars", () => {
    const { title, lede } = greeting(base);
    expect(title).toContain("Khalid");
    expect(title).not.toContain("Osama");
    expect(lede).toBeNull();
  });

  it("keeps the how-to line for the first few comics", () => {
    expect(greeting({ ...base, comics: NEW_USER_COMICS - 1 }).lede).toBe(HOW_TO);
  });

  it("is stable within a day and changes across days", () => {
    expect(greeting(base).title).toBe(greeting(base).title);
    const titles = new Set(["01", "02", "03", "04", "05", "06", "07"].map((d) => greeting({ ...base, dateKey: `2026-11-${d}` }).title));
    expect(titles.size).toBeGreaterThan(1);
  });

  it("notices a second comic on the same day", () => {
    const again = greeting({ ...base, madeToday: true }).title;
    expect(greeting({ ...base, hour: 9 }).title).not.toBe(again);
  });

  it("falls back without a name", () => {
    expect(greeting({ ...base, name: "  " }).title).toBe("Tell me about today");
  });

  it("splits the day into parts", () => {
    expect([6, 13, 18, 23, 2].map(partOfDay)).toEqual(["morning", "afternoon", "evening", "night", "night"]);
  });
});

describe("promptsFor", () => {
  it("gives four distinct prompts from the pool", () => {
    const prompts = promptsFor("2026-11-01");
    expect(prompts).toHaveLength(4);
    expect(new Set(prompts.map((p) => p.text)).size).toBe(4);
    for (const p of prompts) expect(PROMPTS).toContain(p.text);
  });

  it("changes from day to day", () => {
    expect(promptsFor("2026-11-01")).not.toEqual(promptsFor("2026-11-02"));
  });
});
