import { describe, expect, it } from "vitest";
import type { Panel } from "../types";
import { coverPanel } from "./build";

function panel(index: number, extra: Partial<Panel> = {}): Panel {
  return {
    index,
    scene: `Scene ${index}`,
    dialogue: [],
    characterIds: ["nour"],
    image: { kind: "blob", id: `p${index}` },
    consistency: { checked: false, driftedCharacterIds: [], fixedCharacterIds: [], beforeImage: null },
    ...extra,
  };
}

describe("coverPanel", () => {
  it("takes the first drawn panel of the month when nothing stands out", () => {
    const days = [
      { id: "a", panels: [panel(0, { image: null }), panel(1), panel(2)] },
      { id: "b", panels: [panel(0)] },
    ];
    expect(coverPanel(days)).toEqual({ dayId: "a", index: 1 });
  });

  it("prefers the splash, a tall frame and a fuller cast", () => {
    const days = [
      { id: "a", panels: [panel(0), panel(1, { characterIds: ["nour", "karim"] })] },
      {
        id: "b",
        panels: [
          panel(0),
          panel(1, { shot: "splash", characterIds: ["nour", "karim", "teta"], frame: { aspect: 0.75, zone: { side: "top", size: 0.2 } } }),
        ],
      },
    ];
    expect(coverPanel(days)).toEqual({ dayId: "b", index: 1 });
  });

  it("keeps flashbacks off the cover unless nothing else is drawn", () => {
    expect(coverPanel([{ id: "a", panels: [panel(0, { shot: "splash", flashback: true }), panel(1)] }])).toEqual({ dayId: "a", index: 1 });
    expect(coverPanel([{ id: "a", panels: [panel(0, { flashback: true })] }])).toEqual({ dayId: "a", index: 0 });
  });

  it("finds nothing when no panel is drawn", () => {
    expect(coverPanel([{ id: "a", panels: [panel(0, { image: null })] }])).toBeNull();
    expect(coverPanel([])).toBeNull();
  });
});
