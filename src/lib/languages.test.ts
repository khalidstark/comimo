import { describe, expect, it } from "vitest";
import { detectLanguages } from "./languages";

describe("detectLanguages", () => {
  it("follows the hint when there are no words", () => {
    expect(detectLanguages("", "ar")).toEqual({ spoken: ["ar"], dominant: "ar", mixed: false });
    expect(detectLanguages("  123 !?", "en")).toEqual({ spoken: ["en"], dominant: "en", mixed: false });
  });

  it("detects English text", () => {
    expect(detectLanguages("I went to the park", "ar")).toEqual({ spoken: ["en"], dominant: "en", mixed: false });
  });

  it("detects Arabic text", () => {
    expect(detectLanguages("ذهبت إلى الحديقة", "en")).toEqual({ spoken: ["ar"], dominant: "ar", mixed: false });
  });

  it("marks a mix and puts the majority language first", () => {
    expect(detectLanguages("ذهبت إلى the park اليوم", "en")).toEqual({ spoken: ["ar", "en"], dominant: "ar", mixed: true });
    expect(detectLanguages("we met في المقهى yesterday evening", "ar")).toEqual({ spoken: ["en", "ar"], dominant: "en", mixed: true });
  });

  it("breaks a tie with the hint, defaulting to Arabic", () => {
    expect(detectLanguages("hello مرحبا", "en").dominant).toBe("en");
    expect(detectLanguages("hello مرحبا", "ar").dominant).toBe("ar");
  });
});
