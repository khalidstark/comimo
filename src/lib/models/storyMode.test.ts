import { describe, expect, it } from "vitest";
import type { ScriptPanel } from "@/lib/types";
import { saysWordsWereForgotten, silenceForgottenSpeech } from "./storyMode";

const panel = (narration: string, speakerId = "karim"): ScriptPanel => ({
  index: 0,
  scene: "A cafe at night.",
  narration,
  dialogue: [{ speakerId, text: "You'll be fine, trust me.", dir: "ltr" }],
  characterIds: ["nour", "karim"],
});

describe("forgotten words stay unspoken", () => {
  it("spots narration that says the words were forgotten", () => {
    expect(saysWordsWereForgotten("Karim said something kind. I don't remember what.")).toBe(true);
    expect(saysWordsWereForgotten("I can't recall a single word he told me, only his laugh.")).toBe(true);
    expect(saysWordsWereForgotten("She said something, I forget what.")).toBe(true);
    expect(saysWordsWereForgotten("كريم قال حاجة، مش فاكرة قال إيه")).toBe(true);
    expect(saysWordsWereForgotten("نسيت كلامه كله")).toBe(true);
  });

  it("leaves ordinary narration alone", () => {
    expect(saysWordsWereForgotten("I remember exactly what he said.")).toBe(false);
    expect(saysWordsWereForgotten("I forgot my umbrella at home.")).toBe(false);
    expect(saysWordsWereForgotten("كريم قال إنه جاي")).toBe(false);
  });

  it("drops every line in such a panel and keeps the rest", () => {
    const [silent, kept] = silenceForgottenSpeech([panel("Karim talked for an hour. I don't remember a word he said."), panel("The tea was too sweet.")]);
    expect(silent.dialogue).toEqual([]);
    expect(kept.dialogue).toHaveLength(1);
  });
});
