import { describe, expect, it, vi } from "vitest";
import type { Day, WeekSummary } from "./types";

vi.mock("./store", () => ({ getMeta: async () => null, setMeta: async () => {} }));

const { isStale, parseWeek, weekDays, weekEnd, weekPayload, weekStart } = await import("./week");

function day(id: string, date: string, extra: Partial<Day> = {}): Day {
  return {
    id,
    date,
    title: id,
    transcript: "",
    panels: [{ scene: "a scene" }],
    safety: "ok",
    createdAt: `${date}T10:00:00.000Z`,
    ...extra,
  } as unknown as Day;
}

describe("weekStart and weekEnd", () => {
  it("starts the week on Saturday", () => {
    expect(weekStart(new Date(2026, 10, 21))).toBe("2026-11-21"); // Saturday
    expect(weekStart(new Date(2026, 10, 22))).toBe("2026-11-21"); // Sunday
    expect(weekStart(new Date(2026, 10, 27))).toBe("2026-11-21"); // Friday
    expect(weekStart(new Date(2026, 10, 28))).toBe("2026-11-28"); // next Saturday
  });

  it("ends the week on the Friday, across month and year boundaries", () => {
    expect(weekEnd("2026-11-21")).toBe("2026-11-27");
    expect(weekEnd("2026-12-26")).toBe("2027-01-01");
  });
});

describe("weekDays", () => {
  it("keeps this week's real comics, oldest first", () => {
    const days = [
      day("late", "2026-11-25"),
      day("before", "2026-11-20"),
      day("sample", "2026-11-22", { sample: true }),
      day("crisis", "2026-11-22", { safety: "crisis" }),
      day("empty", "2026-11-22", { panels: [] }),
      day("after", "2026-11-28"),
      day("early", "2026-11-21"),
    ];
    expect(weekDays(days, "2026-11-21").map((d) => d.id)).toEqual(["early", "late"]);
  });
});

describe("weekPayload", () => {
  it("collapses whitespace and cuts long text", () => {
    const payload = weekPayload(
      [day("a", "2026-11-21", { transcript: `  hello \n\n world ${"x".repeat(2000)}`, panels: [{ scene: " a \n b " }] as Day["panels"] })],
      "2026-11-21",
    );
    expect(payload.week).toBe("2026-11-21");
    expect(payload.days[0].text.startsWith("hello world x")).toBe(true);
    expect(payload.days[0].text).toHaveLength(1500);
    expect(payload.days[0].scenes).toEqual(["a b"]);
  });
});

describe("isStale", () => {
  const summary = { dayIds: ["a", "b"] } as WeekSummary;

  it("is fresh when the same comics are there", () => {
    expect(isStale(summary, [day("b", "2026-11-21"), day("a", "2026-11-22")])).toBe(false);
  });

  it("is stale when a comic was added or replaced", () => {
    expect(isStale(summary, [day("a", "2026-11-21")])).toBe(true);
    expect(isStale(summary, [day("a", "2026-11-21"), day("c", "2026-11-22")])).toBe(true);
  });
});

describe("parseWeek", () => {
  it("reads a saved summary", () => {
    const raw = JSON.stringify({ headline: "h", goodThings: [], dayIds: [] });
    expect(parseWeek(raw)?.headline).toBe("h");
  });

  it("rejects missing, malformed or incomplete values", () => {
    expect(parseWeek(undefined)).toBeNull();
    expect(parseWeek("not json")).toBeNull();
    expect(parseWeek(JSON.stringify({ headline: "h" }))).toBeNull();
  });
});
