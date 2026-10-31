import { describe, expect, it } from "vitest";
import { starterCast } from "@/fixtures/cast";
import { headBox, matchCast, mergeDetections, nounPhrase, toFigures, type DetectionSet } from "./samMatch";

const look = (id: string) => starterCast.find((member) => member.id === id)!.look;

describe("nounPhrase", () => {
  it("gives SAM one telling feature per person", () => {
    expect(nounPhrase(look("nour"), false)).toBe("woman with curly dark hair");
    expect(nounPhrase(look("teta"), false)).toBe("old woman with lilac headscarf");
    expect(nounPhrase(look("karim"), false)).toBe("man in olive bomber jacket");
  });

  it("names an animal by its colours and kind", () => {
    expect(nounPhrase(look("mishmish"), true)).toBe("orange tabby cat");
    expect(nounPhrase("A scruffy little white dog with a red collar", true)).toBe("scruffy white dog");
  });

  it("falls back to a plain noun", () => {
    expect(nounPhrase("Adult, friendly smile.", false)).toBe("person");
    expect(nounPhrase("Older adult man, calm.", false)).toBe("old man");
  });
});

const box = (x1: number, y1: number, x2: number, y2: number) => ({ x1, y1, x2, y2 });

describe("matching detections to the cast", () => {
  it("merges the same figure found by two phrases and keeps left-to-right order for a shared phrase", () => {
    const sets: DetectionSet[] = [
      // "woman with glasses" finds both women; the script says Nour stands left of Teta.
      { characterId: "nour", animal: false, detections: [{ box: box(600, 100, 900, 900), score: 0.9 }, { box: box(100, 100, 400, 900), score: 0.88 }] },
      { characterId: "teta", animal: false, detections: [{ box: box(602, 98, 901, 902), score: 0.95 }] },
      { characterId: null, animal: false, detections: [{ box: box(100, 100, 400, 900), score: 0.9 }, { box: box(600, 100, 900, 900), score: 0.9 }] },
    ];
    const candidates = mergeDetections(sets, 1000, 1000);
    expect(candidates).toHaveLength(2);
    const cast = [
      { characterId: "nour", animal: false },
      { characterId: "teta", animal: false },
    ];
    const matches = matchCast(cast, candidates);
    expect(candidates[matches[0]!].box.x1).toBe(100);
    expect(candidates[matches[1]!].box.x1).toBe(600);
  });

  it("never gives a person's figure to the cat, and prefers a real person over a phrase-only hit", () => {
    const sets: DetectionSet[] = [
      { characterId: "karim", animal: false, detections: [{ box: box(400, 0, 500, 100), score: 0.5 }] },
      { characterId: "mishmish", animal: true, detections: [{ box: box(700, 600, 900, 800), score: 0.9 }] },
      { characterId: null, animal: false, detections: [{ box: box(100, 200, 350, 950), score: 0.9 }] },
    ];
    const candidates = mergeDetections(sets, 1000, 1000);
    const matches = matchCast(
      [
        { characterId: "karim", animal: false },
        { characterId: "mishmish", animal: true },
      ],
      candidates,
    );
    expect(candidates[matches[0]!].box.x1).toBe(100);
    expect(candidates[matches[1]!].animal).toBe(true);
  });

  it("uses the face inside a figure as its head and keeps stray faces", () => {
    const sets: DetectionSet[] = [{ characterId: null, animal: false, detections: [{ box: box(100, 100, 500, 900), score: 0.9 }] }];
    const candidates = mergeDetections(sets, 1000, 1000);
    const faces = [
      { box: box(200, 120, 320, 260), score: 0.9 },
      { box: box(800, 50, 860, 110), score: 0.7 },
    ];
    const figures = toFigures([], candidates, [], 1000, 1000, faces);
    expect(figures.items).toHaveLength(2);
    expect(figures.items[0].head).toEqual({ x: 0.2, y: 0.12, w: 0.12, h: 0.14 });
    expect(figures.items[1].box).toEqual(figures.items[1].head);
  });
});

describe("headBox", () => {
  it("takes the top of a downscaled mask", () => {
    // A 10 x 20 raster over a 100 x 200 box: a 4-wide head on top of a 10-wide body.
    const data = new Uint8Array(10 * 20);
    for (let y = 0; y < 20; y++) for (let x = 0; x < 10; x++) data[y * 10 + x] = y < 5 ? (x >= 3 && x <= 6 ? 1 : 0) : 1;
    const head = headBox(box(0, 0, 100, 200), { data, width: 10, height: 20 }, false);
    expect(head.y1).toBe(0);
    expect(head.x1).toBeGreaterThanOrEqual(20);
    expect(head.x2).toBeLessThanOrEqual(80);
    expect(head.y2).toBeLessThan(100);
  });
});
