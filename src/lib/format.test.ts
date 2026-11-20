import { describe, expect, it } from "vitest";
import { countWord, formatDay } from "./format";

describe("formatDay", () => {
  it("writes the weekday, day and month from an ISO date", () => {
    expect(formatDay("2026-10-29")).toBe("Thursday 29 October");
  });

  it("does not shift the day across time zones", () => {
    expect(formatDay("2026-01-01")).toBe("Thursday 1 January");
  });
});

describe("countWord", () => {
  it("spells out small counts", () => {
    expect(countWord(0)).toBe("no");
    expect(countWord(4)).toBe("four");
    expect(countWord(10)).toBe("ten");
  });

  it("uses digits above ten", () => {
    expect(countWord(11)).toBe("11");
    expect(countWord(120)).toBe("120");
  });
});
