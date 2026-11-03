import { describe, expect, it } from "vitest";
import { MAX_VOICE_NOTE_MS, overVoiceNoteCap } from "./toWav";

describe("overVoiceNoteCap", () => {
  it("takes notes up to two minutes, with the encoder's slack", () => {
    expect(MAX_VOICE_NOTE_MS).toBe(120_000);
    expect(overVoiceNoteCap(45_000)).toBe(false);
    expect(overVoiceNoteCap(120_000)).toBe(false);
    expect(overVoiceNoteCap(121_400)).toBe(false);
  });

  it("refuses anything longer", () => {
    expect(overVoiceNoteCap(121_600)).toBe(true);
    expect(overVoiceNoteCap(150_000)).toBe(true);
  });

  it("follows a different cap when given one", () => {
    expect(overVoiceNoteCap(61_000, 60_000)).toBe(false);
    expect(overVoiceNoteCap(62_000, 60_000)).toBe(true);
  });
});
