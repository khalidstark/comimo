import { describe, expect, it } from "vitest";
import { panelsFailed } from "./pipeline";

/** What the progress screen says when panels didn't draw. */
describe("panelsFailed", () => {
  it("names the reason the failed panels share", () => {
    const busy = "The models are busy. Try again in a minute.";
    expect(panelsFailed([{ message: busy }, { message: busy }])).toEqual({ message: `2 panels didn't draw. ${busy}` });
    expect(panelsFailed([{ message: busy }])).toEqual({ message: `One panel didn't draw. ${busy}` });
  });

  it("falls back to a plain try again when the reasons differ or are unknown", () => {
    expect(panelsFailed([{ message: "The model took too long. Try again." }, { message: "The model had a problem. Try again." }])).toEqual({
      message: "2 panels didn't draw. Try them again.",
    });
    expect(panelsFailed([{}])).toEqual({ message: "One panel didn't draw. Try it again." });
  });

  it("puts a blocking reason first and keeps its code", () => {
    const cap = "Comimo has drawn all the panels it can for today. Come back tomorrow.";
    expect(panelsFailed([{ message: "The model took too long. Try again." }, { message: cap, code: "cap" }, {}])).toEqual({
      message: `3 panels didn't draw. ${cap}`,
      code: "cap",
    });
    const signin = "Sign in to keep going. It takes a few seconds.";
    expect(panelsFailed([{ message: cap, code: "cap" }, { message: signin, code: "signin" }]).code).toBe("signin");
  });
});
