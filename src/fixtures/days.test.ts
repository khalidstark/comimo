import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { artAt, type ArtPath } from "@/art/manifest";
import { facesSummary, fixedFaces, oneOffFaces } from "@/components/comic/view";
import { starterCastById } from "@/fixtures/cast";
import { pageLayoutChain, splitPages } from "@/lib/layout/comicPages";
import { sampleCheckInQuestions, sampleDays, sampleWeek } from "./days";

const publicFile = (src: string) => fileURLToPath(new URL(`../../public${src}`, import.meta.url));

describe("sample days (real runs)", () => {
  it("are the five invented days, oldest first", () => {
    expect(sampleDays.map((day) => day.id)).toEqual(["sample-teta", "sample-deadline", "sample-rooftop", "sample-sunday", "sample"]);
    const dates = sampleDays.map((day) => day.date);
    expect([...dates].sort()).toEqual(dates);
    expect(sampleDays.every((day) => day.sample && day.safety === "ok")).toBe(true);
  });

  it("show only drawn panels whose files ship", () => {
    for (const day of sampleDays) {
      expect(day.panels.length).toBeGreaterThanOrEqual(4);
      for (const panel of day.panels) {
        const refs = [panel.image, panel.consistency.beforeImage].filter((ref) => ref !== null);
        for (const ref of refs) {
          expect(ref.kind).toBe("art");
          const asset = artAt((ref as { path: ArtPath }).path);
          expect(asset, `${day.id} panel ${panel.index}`).toBeDefined();
          expect(asset.placeholder).toBe(false);
          expect(existsSync(publicFile(asset.src)), asset.src).toBe(true);
        }
      }
    }
  });

  it("keep what SAM 3.1 found, so the faces note and the overlay have real data", () => {
    for (const day of sampleDays) {
      const nameOf = (id: string) => starterCastById[id]?.name ?? id;
      const summary = facesSummary(day.panels, fixedFaces(day.panels, nameOf, () => null), oneOffFaces(day.panels, nameOf));
      expect(summary?.kind, day.id).toBe("sam");
      for (const panel of day.panels) {
        expect(panel.consistency.method).toBe("sam");
        expect(panel.figures?.items.length ?? 0).toBeGreaterThan(0);
        // The boxes are fractions of the drawn image, measured at its own aspect.
        const asset = artAt((panel.image as { path: ArtPath }).path);
        expect(Math.abs(panel.figures!.aspect - asset.width / asset.height)).toBeLessThan(0.02);
        for (const item of panel.figures!.items) {
          for (const box of [item.box, item.head]) {
            expect(box.x).toBeGreaterThanOrEqual(0);
            expect(box.y).toBeGreaterThanOrEqual(0);
            expect(box.x + box.w).toBeLessThanOrEqual(1.001);
            expect(box.y + box.h).toBeLessThanOrEqual(1.001);
          }
        }
      }
    }
  });

  it("cost real money, recorded by the run", () => {
    for (const day of sampleDays) {
      expect(day.cost?.mock).toBeUndefined();
      expect(day.cost?.usd ?? 0).toBeGreaterThan(0.05);
    }
  });

  it("keep the pages they were laid out and drawn for", () => {
    const chain = pageLayoutChain(sampleDays);
    for (const day of sampleDays) {
      const slices = splitPages(day.panels, day.pages, day.id, day.layout);
      expect(slices.every((slice) => slice.layout !== null)).toBe(true);
      expect(chain.get(day.id)).toEqual(slices.map((slice) => slice.layout));
      expect(day.panels.every((panel) => panel.frame)).toBe(true);
    }
  });

  it("give the landing a check-in card and the last sample week from the runs", () => {
    expect(sampleCheckInQuestions.length).toBeGreaterThan(0);
    const week = sampleWeek();
    expect(week.map((cell) => cell.day)).toEqual(["Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri"]);
    const last = sampleDays.at(-1)!;
    expect(week.some((cell) => cell.mood === last.mood)).toBe(true);
  });
});
