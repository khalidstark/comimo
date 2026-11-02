import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { charge, emptyCost, type CostRecord } from "@/lib/costs";
import { aggregateCosts, detachLedger, ledgerAccounts, ledgerOf, monthTotal, recordCost, stats, summarizeAccount } from "./costs";
import { FileKV } from "./kv";

let dir: string;
let kv: FileKV;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "comimo-costs-"));
  kv = new FileKV(dir);
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function cost(...calls: [Parameters<typeof charge>[1], number, Parameters<typeof charge>[3]][]): CostRecord {
  const record = emptyCost();
  for (const [kind, usd, step] of calls) charge(record, kind, usd, step);
  return record;
}

const NOV = new Date("2026-11-02T10:00:00Z");

/** One comic: transcribe, script, 4 panels (one with a redraw), as the routes would file it. */
async function fileComic(account: string, dayId: string, style: "zine" | "painterly" = "zine", panels = 4) {
  await recordCost(account, { dayId, action: "transcribe", cost: cost(["transcribe", 0.003, "transcribe"]) }, kv, NOV);
  await recordCost(account, { dayId, action: "script", cost: cost(["spark", 0.012, "script"]) }, kv, NOV);
  for (let p = 0; p < panels; p++) {
    const record = cost(["image", 0.01, "panels"], ["sam", 0.0025, "faceCheck"], ["sam", 0.0025, "faceCheck"], ["spark", 0.004, "faceCheck"]);
    if (p === 1) charge(record, "image", 0.01, "redraws");
    await recordCost(account, { dayId, action: "panel", cost: record, style, panel: p }, kv, NOV);
  }
}

describe("cost ledger", () => {
  it("files each request under the account and its comic, with the month's running total", async () => {
    await fileComic("acct-a", "day-1");
    // A retry of panel 0 costs again but is still one panel.
    await recordCost("acct-a", { dayId: "day-1", action: "panel", cost: cost(["image", 0.01, "panels"]), style: "zine", panel: 0 }, kv, NOV);
    const entries = await ledgerOf("acct-a", kv);
    expect(entries).toHaveLength(7);
    expect(entries.every((entry) => entry.d === "day-1")).toBe(true);
    const summary = summarizeAccount(entries);
    expect(summary.comics).toHaveLength(1);
    const [comic] = summary.comics;
    expect(comic.panels).toBe(4);
    expect(comic.requests).toBe(7);
    expect(comic.style).toBe("zine");
    expect(comic.cost.usd).toBeCloseTo(0.003 + 0.012 + 4 * 0.019 + 0.01 + 0.01, 6);
    expect(comic.cost.byStep).toEqual({ transcribe: 0.003, script: 0.012, panels: 0.05, faceCheck: 0.036, redraws: 0.01 });
    expect(comic.cost.calls).toEqual({ transcribe: 1, spark: 5, image: 6, sam: 8 });
    expect(await monthTotal("acct-a", "2026-11", kv)).toBeCloseTo(comic.cost.usd, 6);
    expect(await ledgerAccounts(kv)).toEqual(["acct-a"]);
  });

  it("keeps nothing for free requests, and an invalid day id files as cast work", async () => {
    await recordCost("acct-a", { dayId: "day-1", action: "panel", cost: emptyCost(), panel: 0 }, kv, NOV);
    expect(await ledgerOf("acct-a", kv)).toEqual([]);
    await recordCost("acct-a", { dayId: "../../etc", action: "character", cost: cost(["image", 0.01, "sheet"]) }, kv, NOV);
    const [entry] = await ledgerOf("acct-a", kv);
    expect(entry.d).toBeUndefined();
    expect(summarizeAccount([entry]).setup.usd).toBe(0.01);
  });

  it("splits cast work, extras and unfinished comics", async () => {
    await recordCost("acct-a", { action: "photo", cost: cost(["sam", 0.0025, "photo"], ["spark", 0.002, "photo"]) }, kv, NOV);
    await recordCost("acct-a", { action: "character", cost: cost(["image", 0.01, "sheet"]) }, kv, NOV);
    await recordCost("acct-a", { action: "wardrobe", cost: cost(["image", 0.01, "wardrobe"], ["spark", 0.001, "wardrobe"]) }, kv, NOV);
    await recordCost("acct-a", { action: "cover", cost: cost(["image", 0.01, "cover"]) }, kv, NOV);
    await recordCost("acct-a", { dayId: "day-stopped", action: "script", cost: cost(["spark", 0.01, "script"]) }, kv, NOV);
    const summary = summarizeAccount(await ledgerOf("acct-a", kv));
    expect(summary.comics).toEqual([]);
    expect(summary.unfinished).toBe(1);
    expect(summary.setup.usd).toBeCloseTo(0.0255, 9);
    expect(summary.extras.usd).toBe(0.01);
    expect(summary.total.usd).toBeCloseTo(0.0455, 9);
  });

  it("aggregates across accounts: per comic, per panel, per step, per style, onboarding", async () => {
    await fileComic("acct-a", "a1", "zine", 4);
    await fileComic("acct-a", "a2", "painterly", 6);
    await fileComic("acct-b", "b1", "zine", 5);
    await recordCost("acct-b", { action: "character", cost: cost(["image", 0.01, "sheet"]) }, kv, NOV);
    const summaries = await Promise.all((await ledgerAccounts(kv)).map(async (account) => summarizeAccount(await ledgerOf(account, kv))));
    const all = aggregateCosts(summaries);
    expect(all.accounts).toBe(2);
    expect(all.comics).toBe(3);
    const comicUsd = (panels: number) => 0.003 + 0.012 + panels * 0.019 + 0.01;
    expect(all.perComic.median).toBeCloseTo(comicUsd(5), 6);
    expect(all.perComic.mean).toBeCloseTo((comicUsd(4) + comicUsd(5) + comicUsd(6)) / 3, 6);
    expect(all.perComic.p90).toBeCloseTo(comicUsd(6), 6);
    expect(all.panelsPerComic.mean).toBe(5);
    expect(Object.keys(all.perStep)).toEqual(["transcribe", "script", "panels", "faceCheck", "redraws"]);
    expect(all.perStep.redraws).toBeCloseTo(0.01, 9);
    expect(all.perStyle.zine?.n).toBe(2);
    expect(all.perStyle.painterly?.n).toBe(1);
    expect(all.onboardingPerAccount).toMatchObject({ n: 1, mean: 0.01 });
    expect(all.byMonth["2026-11"].comics).toBe(3);
    // No account ids in the owner's view.
    expect(JSON.stringify(all)).not.toContain("acct-");
  });

  it("cuts the ledger loose from a deleted account but keeps the rows", async () => {
    await fileComic("acct-a", "a1");
    await detachLedger("acct-a", kv);
    expect(await ledgerOf("acct-a", kv)).toEqual([]);
    expect(await monthTotal("acct-a", "2026-11", kv)).toBe(0);
    const accounts = await ledgerAccounts(kv);
    expect(accounts).toHaveLength(1);
    expect(accounts[0]).toMatch(/^gone-/);
    expect(summarizeAccount(await ledgerOf(accounts[0], kv)).comics).toHaveLength(1);
  });
});

describe("stats", () => {
  it("gives n, mean, median and nearest-rank p90", () => {
    expect(stats([])).toMatchObject({ n: 0, mean: 0 });
    const s = stats([0.05, 0.01, 0.02, 0.04, 0.03, 0.06, 0.07, 0.08, 0.09, 0.1]);
    expect(s).toMatchObject({ n: 10, min: 0.01, max: 0.1, median: 0.055, p90: 0.09 });
    expect(s.mean).toBeCloseTo(0.055, 9);
  });
});
