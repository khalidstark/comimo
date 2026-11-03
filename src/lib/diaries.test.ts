import { describe, expect, it } from "vitest";
import { weekFrom } from "@/lib/models/meta/week";
import { EVERY_DAY, MAX_DIARIES, daysIn, diaryNameProblem, parseDiaries } from "./diaries";
import type { Day, Diary } from "./types";
import { isStale, weekDays, weekEnd, weekPayload, weekStart } from "./week";

const day = (id: string, date: string, extra: Partial<Day> = {}): Day =>
  ({
    id,
    date,
    title: `Title ${id}`,
    transcript: `Words of ${id}. `.repeat(200),
    languages: { spoken: ["en"], dominant: "en", mixed: false },
    panels: [{ index: 0 }] as Day["panels"],
    mood: "sunny",
    heavy: false,
    safety: "ok",
    createdAt: `${date}T10:00:00.000Z`,
    ...extra,
  }) as Day;

const loves: Diary = { id: "d-love", name: "Things I love", color: "pink", sticker: "heart", createdAt: "2026-11-01T00:00:00.000Z" };
const bad: Diary = { id: "d-bad", name: "Bad things", color: "ink", sticker: "rain", createdAt: "2026-11-01T00:00:00.000Z" };

describe("diaries", () => {
  it("reads the stored list and drops anything malformed or duplicated", () => {
    const raw = JSON.stringify([loves, { ...loves }, { id: "x y", name: "Bad id" }, { id: "d2", name: "  " }, { id: "d3", name: "Dreams", color: "neon", sticker: "?" }, { id: EVERY_DAY, name: "Every day" }]);
    expect(parseDiaries(raw)).toEqual([loves, { id: "d3", name: "Dreams", color: "pink", sticker: "heart", createdAt: new Date(0).toISOString() }]);
    expect(parseDiaries("not json")).toEqual([]);
    expect(parseDiaries(undefined)).toEqual([]);
    const many = Array.from({ length: 20 }, (_, i) => ({ ...loves, id: `d${i}`, name: `D ${i}` }));
    expect(parseDiaries(JSON.stringify(many))).toHaveLength(MAX_DIARIES);
  });

  it("checks names: required, short, unique, and never the daily one", () => {
    expect(diaryNameProblem("  ", [])).toMatch(/name/);
    expect(diaryNameProblem("x".repeat(41), [])).toMatch(/40/);
    expect(diaryNameProblem("things i LOVE", [loves])).toMatch(/already/);
    expect(diaryNameProblem("Things I love", [loves], "d-love")).toBeNull();
    expect(diaryNameProblem("Every Day", [])).toMatch(/daily/);
    expect(diaryNameProblem("أشياء بحبها", [loves])).toBeNull();
  });

  it("files comics: own diaries by id; Every day takes the rest, old days and deleted diaries included", () => {
    const days = [day("a", "2026-11-01"), day("b", "2026-11-02", { diaryId: "d-love" }), day("c", "2026-11-03", { diaryId: "gone" }), day("s", "2026-11-03", { sample: true })];
    expect(daysIn("d-love", days, [loves, bad]).map((d) => d.id)).toEqual(["b"]);
    expect(daysIn("d-bad", days, [loves, bad])).toEqual([]);
    expect(daysIn(EVERY_DAY, days, [loves, bad]).map((d) => d.id)).toEqual(["c", "a"]);
  });
});

describe("the week", () => {
  it("runs Saturday to Friday in local time", () => {
    expect(weekStart(new Date(2026, 10, 3))).toBe("2026-10-31"); // Tuesday 3 Nov -> Saturday 31 Oct
    expect(weekStart(new Date(2026, 9, 31))).toBe("2026-10-31"); // a Saturday is its own start
    expect(weekStart(new Date(2026, 10, 6))).toBe("2026-10-31"); // Friday 6 Nov
    expect(weekStart(new Date(2026, 10, 7))).toBe("2026-11-07");
    expect(weekEnd("2026-10-31")).toBe("2026-11-06");
  });

  it("reads only this week's real comics and never a crisis note", () => {
    const days = [
      day("before", "2026-10-30"),
      day("sat", "2026-10-31"),
      day("crisis", "2026-11-01", { safety: "crisis", panels: [] }),
      day("sample", "2026-11-02", { sample: true }),
      day("tue", "2026-11-03"),
      day("next", "2026-11-07"),
    ];
    const week = weekDays(days, "2026-10-31");
    expect(week.map((d) => d.id)).toEqual(["sat", "tue"]);
    const payload = weekPayload(week, "2026-10-31");
    expect(payload.days[0].text.length).toBeLessThanOrEqual(1500);
    expect(Object.keys(payload.days[0]).sort()).toEqual(["date", "id", "text", "title"]);
  });

  it("knows when new comics came since it was written", () => {
    const summary = { week: "2026-10-31", headline: "h", goodThings: [], line: "", dayIds: ["sat"], mode: "meta" as const, writtenAt: "" };
    expect(isStale(summary, [day("sat", "2026-10-31")])).toBe(false);
    expect(isStale(summary, [day("sat", "2026-10-31"), day("tue", "2026-11-03")])).toBe(true);
  });

  it("keeps only good things tied to this week's comics, and never advice or scores", () => {
    const answer = weekFrom(
      {
        headline: "A week of small brave things",
        goodThings: [
          { text: "You finally called your grandmother back.", dayId: "sat", kind: "did" },
          { text: "You should sleep more.", dayId: "sat", kind: "did" },
          { text: "Karim brought you tea.", dayId: "invented", kind: "happened" },
          { text: "Your week was a 7 out of 10.", dayId: "tue", kind: "happened" },
          { text: "Your friend waited for you at the bus stop.", dayId: "tue", kind: "weird" },
        ],
        line: "Here's to more weeks like it.",
      },
      ["sat", "tue"],
    );
    expect(answer?.goodThings).toEqual([
      { text: "You finally called your grandmother back.", dayId: "sat", kind: "did" },
      { text: "Your friend waited for you at the bus stop.", dayId: "tue", kind: "happened" },
    ]);
    expect(weekFrom({ headline: "x", goodThings: [], line: "" }, ["sat"])).toBeNull();
  });
});
