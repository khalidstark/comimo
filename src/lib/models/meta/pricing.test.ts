import { describe, expect, it } from "vitest";
import { aboutUsd, addCosts, charge, emptyCost, parseCost } from "@/lib/costs";
import { PRICES, chargeImage, chargeSam, chargeSpark, chargeTranscribe, sparkUsage, sparkUsd, transcribeUsd } from "./pricing";
import type { UsageMeter } from "@/lib/guard";

/** A meter that only records charges, like the guard's (no counters). */
function testMeter() {
  const cost = emptyCost();
  const meter: UsageMeter = {
    billed: true,
    beforeCall: () => {},
    charge: (kind, usd, step = "panels") => charge(cost, kind, usd, step),
    tag: () => {},
    get cost() {
      return cost;
    },
  };
  return meter;
}

describe("pricing", () => {
  it("reads Spark usage from chat completions and from Responses", () => {
    expect(sparkUsage({ prompt_tokens: 1000, completion_tokens: 200, prompt_tokens_details: { cached_tokens: 400 } })).toEqual({ input: 1000, cached: 400, output: 200 });
    expect(sparkUsage({ input_tokens: 3000, output_tokens: 50 })).toEqual({ input: 3000, cached: 0, output: 50 });
    expect(sparkUsage(undefined)).toEqual({ input: 0, cached: 0, output: 0 });
    // Cached can never exceed input; junk counts as zero.
    expect(sparkUsage({ prompt_tokens: 10, prompt_tokens_details: { cached_tokens: 99 }, completion_tokens: -5 })).toEqual({ input: 10, cached: 10, output: 0 });
  });

  it("prices Spark tokens with the cached rate for cached input", () => {
    // 600 fresh + 400 cached in, 200 out.
    const usd = sparkUsd({ input: 1000, cached: 400, output: 200 });
    expect(usd).toBeCloseTo(600 * 1.25e-6 + 400 * 0.15e-6 + 200 * 4.25e-6, 12);
    expect(usd).toBeCloseTo(0.00166, 6);
  });

  it("bills transcription in whole seconds at $0.18 an hour", () => {
    expect(transcribeUsd(59.2)).toBeCloseTo((60 * 0.18) / 3600, 12);
    expect(transcribeUsd(0)).toBe(0);
  });

  it("charges each finished call to the meter under the context's step", () => {
    const meter = testMeter();
    chargeImage({ meter });
    chargeSam({ meter, costStep: "faceCheck" });
    chargeSam({ meter, costStep: "faceCheck" });
    chargeSpark({ meter, costStep: "faceCheck" }, { input_tokens: 2000, output_tokens: 100 }, "test judge");
    chargeImage({ meter, costStep: "redraws" });
    chargeTranscribe({ meter, costStep: "transcribe" }, 30);
    const judge = 2000 * PRICES.spark.input + 100 * PRICES.spark.output;
    expect(meter.cost.calls).toEqual({ image: 2, sam: 2, spark: 1, transcribe: 1 });
    expect(meter.cost.byStep.panels).toBeCloseTo(0.01, 9);
    expect(meter.cost.byStep.faceCheck).toBeCloseTo(0.005 + judge, 6);
    expect(meter.cost.byStep.redraws).toBeCloseTo(0.01, 9);
    expect(meter.cost.byStep.transcribe).toBeCloseTo(0.0015, 9);
    expect(meter.cost.usd).toBeCloseTo(0.02 + 0.005 + judge + 0.0015, 6);
  });

  it("works without a meter (scripts, tests)", () => {
    expect(chargeImage(undefined)).toBe(0.01);
    expect(chargeSam({})).toBe(0.0025);
  });
});

describe("cost records", () => {
  it("adds records step by step and kind by kind", () => {
    const a = emptyCost();
    charge(a, "image", 0.01, "panels");
    charge(a, "sam", 0.0025, "faceCheck");
    const b = emptyCost();
    charge(b, "image", 0.01, "panels");
    charge(b, "transcribe", 0.002, "transcribe");
    const sum = addCosts(a, b);
    expect(sum).toEqual({ usd: 0.0245, calls: { image: 2, sam: 1, transcribe: 1 }, byStep: { panels: 0.02, faceCheck: 0.0025, transcribe: 0.002 } });
    expect(addCosts(null, undefined)).toEqual(emptyCost());
  });

  it("keeps sums free of float noise", () => {
    const record = emptyCost();
    for (let i = 0; i < 10; i++) charge(record, "spark", 0.1, "script");
    expect(record.usd).toBe(1);
  });

  it("parses a cost header and drops anything unknown or absurd", () => {
    expect(parseCost({ usd: 0.012, calls: { image: 1, bogus: 3 }, byStep: { panels: 0.01, nope: 1 } })).toEqual({ usd: 0.012, calls: { image: 1 }, byStep: { panels: 0.01 } });
    expect(parseCost({ usd: -1, calls: {}, byStep: {} })).toBeNull();
    expect(parseCost({ usd: 5000, calls: {}, byStep: {} })).toBeNull();
    expect(parseCost("0.01")).toBeNull();
  });

  it("says amounts the way people read them", () => {
    expect(aboutUsd(0)).toBe("nothing");
    expect(aboutUsd(0.003)).toBe("less than a cent");
    expect(aboutUsd(0.0712)).toBe("about $0.07");
    expect(aboutUsd(1.5)).toBe("about $1.50");
  });
});
