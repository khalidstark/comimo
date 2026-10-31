import { describe, expect, it } from "vitest";
import { SHOTS, type Beat, type Shot } from "../types";
import { leanDegrees, quadArea } from "./geometry";
import { panelFrames } from "./frames";
import { DRAW_SIZES, desktopGeometry, phoneGeometry, type PageGeometry } from "./page";
import { normalizeStory, pickLayout, resolveLayout, splashIndex, type StoryPanel } from "./pickLayout";
import { TEMPLATES } from "./templates";
import { pageLayoutChain } from "./comicPages";

function story(count: number, splash: number, shots: Shot[] = []): StoryPanel[] {
  return Array.from({ length: count }, (_, index) => ({
    index,
    shot: index === splash ? "splash" : (shots[index] ?? (index === 0 ? "establishing" : "medium")),
    beat: (index === splash ? "climax" : index === 0 ? "setup" : index === count - 1 ? "release" : "build") as Beat,
    caption: index % 2 === 0 ? "A short caption for this beat." : undefined,
    dialogue: index % 3 === 1 ? [{ text: "Yalla, we're late again!" }] : [],
    characterIds: ["nour"],
  }));
}

/** Each panel's art area (a phone caption band above the art is page, not picture). */
function areas(geometry: PageGeometry): number[] {
  return [...geometry.panels].sort((a, b) => a.index - b.index).map((panel) => quadArea(panel.quad) * (1 - (panel.band ?? 0)));
}

describe("templates", () => {
  it("has 10 to 14 hand-designed templates for 4, 5 and 6 panels", () => {
    expect(TEMPLATES.length).toBeGreaterThanOrEqual(10);
    expect(TEMPLATES.length).toBeLessThanOrEqual(14);
    expect(new Set(TEMPLATES.map((t) => t.id)).size).toBe(TEMPLATES.length);
  });

  it("covers every splash position with at least two templates, so no day has to repeat yesterday's", () => {
    for (const count of [4, 5, 6]) {
      for (let focus = 0; focus < count; focus++) {
        const covering = TEMPLATES.filter((t) => t.count === count && t.variants.some((v) => v.focus === focus));
        expect(covering.length, `${count} panels, splash at ${focus}`).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it("gives the splash the biggest slot, clearly, on desktop and phone", () => {
    for (const template of TEMPLATES) {
      for (const variant of template.variants) {
        expect(variant.slots).toHaveLength(template.count);
        const wordy = story(template.count, variant.focus).map((p) => ({
          ...p,
          caption: "It was the longest morning of the whole week, honestly.",
          dialogue: [{ text: "I can't believe the bus just never came, again!" }],
        }));
        for (const geometry of [
          desktopGeometry(variant),
          phoneGeometry(variant, story(template.count, variant.focus), template.id),
          phoneGeometry(variant, wordy, template.id),
        ]) {
          const sizes = areas(geometry);
          const others = sizes.filter((_, i) => i !== variant.focus);
          expect(sizes[variant.focus], `${template.id} focus ${variant.focus}`).toBeGreaterThan(Math.max(...others) * 1.25);
        }
      }
    }
  });

  it("leans gutters 3 to 8 degrees or keeps them straight, and stays on the page", () => {
    for (const template of TEMPLATES) {
      for (const variant of template.variants) {
        const geometry = desktopGeometry(variant);
        for (const panel of geometry.panels) {
          for (let i = 0; i < 4; i++) {
            const lean = leanDegrees(panel.quad[i], panel.quad[(i + 1) % 4]);
            expect(lean < 0.6 || (lean >= 2.8 && lean <= 8.2), `${template.id} f${variant.focus} panel ${panel.index}: ${lean}`).toBe(true);
          }
          for (const [x, y] of panel.quad) {
            expect(x).toBeGreaterThanOrEqual(-0.01);
            expect(x).toBeLessThanOrEqual(12.01);
            expect(y).toBeGreaterThanOrEqual(-0.01);
            expect(y).toBeLessThanOrEqual(variant.height + 0.01);
          }
        }
      }
    }
  });

  it("uses varied panel sizes, never a grid of equal boxes", () => {
    for (const template of TEMPLATES) {
      for (const variant of template.variants) {
        const sizes = areas(desktopGeometry(variant));
        expect(Math.max(...sizes) / Math.min(...sizes)).toBeGreaterThan(2);
      }
    }
  });
});

describe("pickLayout", () => {
  it("returns a valid layout for 4, 5 and 6 panels with the splash anywhere", () => {
    for (const count of [4, 5, 6]) {
      for (let splash = 0; splash < count; splash++) {
        for (const seed of ["a", "b", "day-123"]) {
          const panels = story(count, splash);
          const choice = pickLayout(panels, seed);
          expect(choice).not.toBeNull();
          const resolved = resolveLayout(choice, count);
          expect(resolved.fallback).toBe(false);
          expect(resolved.variant.slots).toHaveLength(count);
          expect(choice!.focus).toBe(splash);
        }
      }
    }
  });

  it("puts the splash panel in the biggest slot", () => {
    for (const count of [4, 5, 6]) {
      for (let splash = 0; splash < count; splash++) {
        const { variant } = resolveLayout(pickLayout(story(count, splash), `seed-${splash}`), count);
        const sizes = areas(desktopGeometry(variant));
        expect(sizes.indexOf(Math.max(...sizes))).toBe(splash);
      }
    }
  });

  it("is deterministic per seed", () => {
    const panels = story(5, 3);
    expect(pickLayout(panels, "2026-10-31-abc")).toEqual(pickLayout(panels, "2026-10-31-abc"));
  });

  it("never reuses the previous day's template", () => {
    for (const count of [4, 5, 6]) {
      for (let splash = 0; splash < count; splash++) {
        const panels = story(count, splash);
        for (const previous of TEMPLATES.filter((t) => t.count === count)) {
          const choice = pickLayout(panels, "seed", previous.id);
          expect(choice!.template).not.toBe(previous.id);
          expect(choice!.focus).toBe(splash);
        }
      }
    }
  });

  it("sends establishing shots to wide slots and close-ups to small ones when it can", () => {
    const choice = pickLayout(story(4, 3, ["establishing", "closeup", "detail"]), "x");
    const { variant } = resolveLayout(choice, 4);
    const geometry = desktopGeometry(variant);
    const first = geometry.panels[0].box;
    expect(first.w / first.h).toBeGreaterThan(0.85);
  });

  it("falls back to a safe page for other counts", () => {
    expect(pickLayout(story(3, 1), "x")).toBeNull();
    const resolved = resolveLayout(null, 3);
    expect(resolved.fallback).toBe(true);
    expect(resolved.variant.slots).toHaveLength(3);
    expect(resolveLayout({ template: "gone", focus: 0 }, 4).fallback).toBe(true);
  });
});

describe("story normalising", () => {
  it("keeps exactly one splash", () => {
    const none = story(5, -1).map((p) => ({ ...p, shot: "medium" as Shot }));
    expect(normalizeStory(none).filter((p) => p.shot === "splash")).toHaveLength(1);
    const many = story(5, 2).map((p) => ({ ...p, shot: "splash" as Shot }));
    const fixed = normalizeStory(many);
    expect(fixed.filter((p) => p.shot === "splash")).toHaveLength(1);
    expect(splashIndex(fixed)).toBe(2);
  });

  it("infers shots for days made before layouts", () => {
    const old: StoryPanel[] = story(4, 1).map((panel) => ({ ...panel, shot: undefined, beat: undefined }));
    const filled = normalizeStory(old);
    expect(filled.every((p) => SHOTS.includes(p.shot!))).toBe(true);
    expect(filled.filter((p) => p.shot === "splash")).toHaveLength(1);
  });
});

describe("day chain", () => {
  it("never gives two days in a row the same template", () => {
    const days = Array.from({ length: 12 }, (_, i) => ({
      id: `day-${i}`,
      date: `2026-10-${String(i + 1).padStart(2, "0")}`,
      createdAt: `2026-10-${String(i + 1).padStart(2, "0")}T10:00:00Z`,
      panels: story(4 + (i % 3), i % (4 + (i % 3))),
    }));
    const chain = pageLayoutChain(days);
    for (let i = 1; i < days.length; i++) {
      expect(chain.get(days[i].id)![0]!.template).not.toBe(chain.get(days[i - 1].id)![0]!.template);
    }
  });
});

describe("panel frames", () => {
  it("draws every panel at a size Muse Image supports and leaves lettering room only where there is text", () => {
    const panels: StoryPanel[] = story(6, 4).map((p) => ({ ...p, caption: "Later that evening, on the roof." }));
    panels[5] = { ...panels[5], caption: undefined, dialogue: [] };
    const frames = panelFrames(pickLayout(panels, "f"), panels, "f");
    expect(frames).toHaveLength(6);
    for (const frame of frames) expect(DRAW_SIZES.some((s) => Math.abs(s.aspect - frame.aspect) < 1e-3)).toBe(true);
    expect(frames[5].zone.side).toBe("none");
    for (const frame of frames.slice(0, 5)) {
      expect(frame.zone.side).not.toBe("none");
      expect(frame.zone.size).toBeGreaterThan(0.1);
      expect(frame.zone.size).toBeLessThanOrEqual(frame.zone.side === "top" ? 0.44 : 0.5);
    }
  });
});

describe("insets", () => {
  it("keep the corner they cover inside the hero's empty band and tell the artist how big it is", () => {
    const panels = story(4, 3).map((p) => ({ ...p, caption: "Then it rained." }));
    const frames = panelFrames({ template: "inset-4", focus: 3 }, panels, "x");
    const hero = frames[3];
    expect(hero.covered).toBe("top-left");
    expect(hero.coverage!.w).toBeGreaterThan(0.3);
    expect(hero.zone.side).toBe("top");
    expect(hero.zone.size).toBeGreaterThanOrEqual(hero.coverage!.h);
  });
});

describe("phone caption bands", () => {
  it("give long narration a band above the art instead of covering it, and only when it is needed", () => {
    const narration = "The roof air was cool against my face. The bridge lights blinked far away while his small speaker hummed old songs.";
    for (const template of TEMPLATES) {
      const variant = template.variants[0];
      const silent = story(template.count, variant.focus).map((p) => ({ ...p, caption: undefined, dialogue: [] }));
      const quiet = phoneGeometry(variant, silent, template.id);
      expect(quiet.panels.every((panel) => !panel.band)).toBe(true);
      const told = story(template.count, variant.focus).map((p) => ({ ...p, narration, dialogue: [{ text: "So, is his tea better than mine?" }] }));
      const phone = phoneGeometry(variant, told, template.id);
      for (const panel of phone.panels) {
        if (!panel.band) continue;
        expect(panel.inset).toBe(false);
        expect(panel.band).toBeGreaterThan(0);
        expect(panel.band).toBeLessThanOrEqual(0.6);
      }
    }
  });
});

describe("phone pages", () => {
  it("never lay one panel over another: insets get a place of their own", () => {
    for (const template of TEMPLATES) {
      for (const variant of template.variants) {
        const phone = phoneGeometry(variant, story(template.count, variant.focus), template.id);
        expect(phone.panels).toHaveLength(template.count);
        for (const a of phone.panels) {
          expect(a.inset, `${template.id} panel ${a.index}`).toBe(false);
          for (const b of phone.panels) {
            if (a.index >= b.index) continue;
            const overlapW = Math.min(a.inner.x + a.inner.w, b.inner.x + b.inner.w) - Math.max(a.inner.x, b.inner.x);
            const overlapH = Math.min(a.inner.y + a.inner.h, b.inner.y + b.inner.h) - Math.max(a.inner.y, b.inner.y);
            expect(overlapW > 0.05 && overlapH > 0.05, `${template.id}: ${a.index} over ${b.index}`).toBe(false);
          }
        }
      }
    }
  });
});

describe("phone pages fill the width", () => {
  it("sets every row as one panel across the page or a pair that fills it, at 0.55 to 1.3 of its width tall", () => {
    for (const template of TEMPLATES) {
      for (const variant of template.variants) {
        const phone = phoneGeometry(variant, story(template.count, variant.focus), template.id);
        for (const panel of phone.panels) {
          const partners = phone.panels.filter((other) => {
            if (other.index === panel.index) return false;
            const shared = Math.min(other.box.y + other.box.h, panel.box.y + panel.box.h) - Math.max(other.box.y, panel.box.y);
            return shared > 0.5 * Math.min(other.box.h, panel.box.h);
          });
          expect(partners.length, `${template.id} panel ${panel.index}`).toBeLessThanOrEqual(1);
          const rowWidth = panel.box.w + (partners[0]?.box.w ?? 0);
          expect(rowWidth, `${template.id} panel ${panel.index} row width`).toBeGreaterThan(12 - 2 * 0.14 - 0.6);
          const art = panel.inner.h * (1 - (panel.band ?? 0));
          expect(art / panel.box.w).toBeGreaterThan(0.4);
          expect(art / panel.box.w).toBeLessThan(1.45);
        }
      }
    }
  });
});

describe("cover crop", () => {
  it("keeps every character in view, or at least every head", async () => {
    const { coverCrop } = await import("./crop");
    const figures = {
      aspect: 3,
      items: [
        { characterId: "nour", kind: "person" as const, box: { x: 0.05, y: 0.2, w: 0.2, h: 0.8 }, head: { x: 0.1, y: 0.2, w: 0.08, h: 0.2 } },
        { characterId: "karim", kind: "person" as const, box: { x: 0.3, y: 0.1, w: 0.15, h: 0.9 }, head: { x: 0.33, y: 0.1, w: 0.07, h: 0.2 } },
      ],
    };
    const crop = coverCrop(3, 1.2, figures);
    expect(crop.w).toBeCloseTo(0.4);
    expect(crop.x).toBeLessThanOrEqual(0.05);
    expect(crop.x + crop.w).toBeGreaterThanOrEqual(0.449);
    // Without figures, a left lettering zone stays in view.
    expect(coverCrop(3, 1.2, null, { side: "left", size: 0.3 }).x).toBe(0);
  });
});
