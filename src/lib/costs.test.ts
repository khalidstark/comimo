import { describe, expect, it } from "vitest";
import { aboutUsd, addCosts, charge, costFromResponse, COST_HEADER, emptyCost, parseCost } from "./costs";

describe("charge", () => {
  it("adds the amount, counts the call and files it under the step", () => {
    const record = emptyCost();
    charge(record, "image", 0.04, "panels");
    charge(record, "image", 0.04, "panels");
    charge(record, "spark", 0.01, "script");
    expect(record.usd).toBeCloseTo(0.09, 6);
    expect(record.calls).toEqual({ image: 2, spark: 1 });
    expect(record.byStep.panels).toBeCloseTo(0.08, 6);
    expect(record.byStep.script).toBeCloseTo(0.01, 6);
  });

  it("counts the call but adds no money for a negative or non-finite amount", () => {
    const record = emptyCost();
    charge(record, "sam", -1, "faceCheck");
    charge(record, "sam", Number.NaN, "faceCheck");
    expect(record.usd).toBe(0);
    expect(record.calls.sam).toBe(2);
  });
});

describe("addCosts", () => {
  it("sums two records without changing either", () => {
    const a = emptyCost();
    const b = emptyCost();
    charge(a, "image", 0.1, "panels");
    charge(b, "image", 0.2, "panels");
    charge(b, "transcribe", 0.05, "transcribe");
    const sum = addCosts(a, b);
    expect(sum.usd).toBeCloseTo(0.35, 6);
    expect(sum.calls).toEqual({ image: 2, transcribe: 1 });
    expect(a.usd).toBe(0.1);
    expect(b.usd).toBe(0.25);
  });

  it("treats null and undefined as empty", () => {
    expect(addCosts(null, undefined)).toEqual(emptyCost());
  });
});

describe("parseCost", () => {
  it("rejects anything that is not an object with a sane usd", () => {
    expect(parseCost(null)).toBeNull();
    expect(parseCost("1")).toBeNull();
    expect(parseCost({})).toBeNull();
    expect(parseCost({ usd: -1 })).toBeNull();
    expect(parseCost({ usd: 101 })).toBeNull();
  });

  it("drops unknown kinds and steps and out-of-range amounts", () => {
    const record = parseCost({
      usd: 0.5,
      calls: { image: 2.4, bogus: 3, sam: -1 },
      byStep: { panels: 0.4, bogus: 0.1, script: 500 },
    });
    expect(record).toEqual({ usd: 0.5, calls: { image: 2 }, byStep: { panels: 0.4 } });
  });
});

describe("costFromResponse", () => {
  it("reads the cost header", () => {
    const response = new Response("", { headers: { [COST_HEADER]: JSON.stringify({ usd: 0.02 }) } });
    expect(costFromResponse(response)?.usd).toBe(0.02);
  });

  it("returns null without the header or with broken JSON", () => {
    expect(costFromResponse(new Response(""))).toBeNull();
    expect(costFromResponse(new Response("", { headers: { [COST_HEADER]: "{nope" } }))).toBeNull();
  });
});

describe("aboutUsd", () => {
  it("says nothing for zero and invalid amounts", () => {
    expect(aboutUsd(0)).toBe("nothing");
    expect(aboutUsd(Number.NaN)).toBe("nothing");
  });

  it("says less than a cent below half a cent", () => {
    expect(aboutUsd(0.004)).toBe("less than a cent");
  });

  it("shows cents under ten dollars and whole dollars above", () => {
    expect(aboutUsd(0.07)).toBe("about $0.07");
    expect(aboutUsd(12.4)).toBe("about $12");
  });
});
