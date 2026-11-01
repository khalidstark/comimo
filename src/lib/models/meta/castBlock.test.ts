import { describe, expect, it } from "vitest";
import { castBlock } from "./prompts";
import type { CastBrief } from "@/lib/types";

const me: CastBrief = {
  id: "nour",
  name: "Youssef",
  role: "self",
  look: "Young man with curly hair.",
  personality: "With people: sarcastic.",
  about: { interests: ["football"], ownInterests: ["padel"], manner: ["sarcastic", "quiet"], pronouns: "he" },
};

function members(cast: CastBrief[]) {
  return JSON.parse(castBlock(cast).replace(/^CAST\n/, "")) as Record<string, unknown>[];
}

describe("castBlock", () => {
  it("gives the speaker their manner, interests and pronouns, never their look", () => {
    const [self] = members([me]);
    expect(self).toEqual({
      id: "nour",
      name: "Youssef",
      role: "self",
      personality: "With people: sarcastic.",
      withPeople: ["sarcastic: answers with dry, sarcastic one-liners", "quiet: says little, in short lines"],
      interests: ["football", "padel"],
      pronouns: "he",
    });
  });

  it("leaves About-you fields off everyone else and off a speaker without answers", () => {
    const friend: CastBrief = { ...me, id: "karim", name: "Karim", role: "friend" };
    const plain: CastBrief = { id: "nour", name: "Nour", role: "self", look: "x", personality: "" };
    expect(members([friend, plain])).toEqual([
      { id: "karim", name: "Karim", role: "friend", personality: "With people: sarcastic." },
      { id: "nour", name: "Nour", role: "self", personality: "" },
    ]);
  });
});
