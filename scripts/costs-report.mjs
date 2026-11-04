#!/usr/bin/env node
/**
 * What Comimo's comics cost, from the server's cost ledger.
 *
 *   node scripts/costs-report.mjs                    local dev store (.data/kv.json, or COMIMO_DATA_DIR)
 *   node scripts/costs-report.mjs --url https://comimo.example   the deployed app's /api/maintenance/costs
 *   node scripts/costs-report.mjs --json             the raw numbers
 *
 * With --url, the secret comes from COMIMO_MAINTENANCE_SECRET in the
 * environment (never from a file, never printed). The local mode reads the
 * ledger rows directly and adds them up the same way the endpoint does
 * (src/lib/server/costs.ts is the reference): no account ids are printed.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const urlAt = args.indexOf("--url");
const base = urlAt >= 0 ? args[urlAt + 1] : null;

const COMIC_STEPS = ["transcribe", "outfit", "script", "sheets", "panels", "faceCheck", "redraws"];
const SETUP = new Set(["character", "photo", "sprite", "wardrobe"]);
const round = (v) => Math.round(v * 1e6) / 1e6;

function stats(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  const n = sorted.length;
  if (n === 0) return { n: 0, total: 0, mean: 0, median: 0, p90: 0, min: 0, max: 0 };
  const total = sorted.reduce((s, v) => s + v, 0);
  const median = n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
  const p90 = sorted[Math.min(n - 1, Math.max(0, Math.ceil(0.9 * n) - 1))];
  return { n, total: round(total), mean: round(total / n), median: round(median), p90: round(p90), min: round(sorted[0]), max: round(sorted[n - 1]) };
}

/** The same sums as aggregateCosts(), from the raw ledger rows of the local store. */
function aggregateLocal(file) {
  const data = JSON.parse(readFileSync(file, "utf8"));
  const accounts = Object.keys(data["cost:accounts"]?.h ?? {});
  const comics = [];
  const setupPerAccount = [];
  let unfinished = 0;
  let total = 0;
  for (const account of accounts) {
    const rows = Object.values(data[`cost:${account}`]?.h ?? {}).flatMap((raw) => {
      try {
        return [JSON.parse(raw)];
      } catch {
        return [];
      }
    });
    const days = new Map();
    let setup = 0;
    for (const row of rows) {
      total += row.u ?? 0;
      if (row.d) days.set(row.d, [...(days.get(row.d) ?? []), row]);
      else if (SETUP.has(row.a)) setup += row.u ?? 0;
    }
    if (setup > 0) setupPerAccount.push(setup);
    for (const list of days.values()) {
      const panels = new Set(list.filter((r) => r.a === "panel" && r.p !== undefined).map((r) => r.p));
      if (panels.size === 0) {
        unfinished += 1;
        continue;
      }
      const byStep = {};
      const calls = {};
      for (const r of list) {
        for (const [step, usd] of Object.entries(r.b ?? {})) byStep[step] = (byStep[step] ?? 0) + usd;
        for (const [kind, n] of Object.entries(r.c ?? {})) calls[kind] = (calls[kind] ?? 0) + n;
      }
      comics.push({
        usd: list.reduce((s, r) => s + (r.u ?? 0), 0),
        panels: panels.size,
        style: list.find((r) => r.a === "panel" && r.s)?.s ?? null,
        month: list.map((r) => r.t).sort()[0].slice(0, 7),
        byStep,
        calls,
      });
    }
  }
  const perStep = {};
  for (const step of COMIC_STEPS) {
    const sum = comics.reduce((s, c) => s + (c.byStep[step] ?? 0), 0);
    if (sum > 0) perStep[step] = round(sum / comics.length);
  }
  const callsPerComic = {};
  for (const kind of ["spark", "image", "sam", "transcribe"]) {
    const sum = comics.reduce((s, c) => s + (c.calls[kind] ?? 0), 0);
    if (sum > 0) callsPerComic[kind] = Math.round((sum / comics.length) * 10) / 10;
  }
  const perStyle = {};
  for (const style of new Set(comics.map((c) => c.style).filter(Boolean))) perStyle[style] = stats(comics.filter((c) => c.style === style).map((c) => c.usd));
  const byMonth = {};
  for (const c of comics) {
    byMonth[c.month] ??= { comics: 0, usd: 0 };
    byMonth[c.month].comics += 1;
    byMonth[c.month].usd = round(byMonth[c.month].usd + c.usd);
  }
  return {
    accounts: accounts.length,
    comics: comics.length,
    unfinished,
    perComic: stats(comics.map((c) => c.usd)),
    perPanel: stats(comics.map((c) => c.usd / c.panels)),
    panelsPerComic: stats(comics.map((c) => c.panels)),
    perStep,
    callsPerComic,
    perStyle,
    onboardingPerAccount: stats(setupPerAccount),
    total: round(total),
    byMonth,
  };
}

async function fromEndpoint(url) {
  const secret = process.env.COMIMO_MAINTENANCE_SECRET?.trim();
  if (!secret) {
    console.error("Set COMIMO_MAINTENANCE_SECRET in the environment to read the deployed ledger.");
    process.exit(1);
  }
  const response = await fetch(new URL("/api/maintenance/costs", url), { headers: { Authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) {
    console.error(`The endpoint answered ${response.status}.`);
    process.exit(1);
  }
  return response.json();
}

const usd = (v) => `$${(v ?? 0).toFixed(4)}`;
const report = base ? await fromEndpoint(base) : aggregateLocal(path.resolve(process.cwd(), process.env.COMIMO_DATA_DIR || ".data", "kv.json"));

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  const c = report.perComic;
  console.log(`Comimo costs (${base ? "deployed" : "local"} ledger)`);
  console.log(`  accounts ${report.accounts}, comics ${report.comics}, stopped before drawing ${report.unfinished}`);
  console.log(`  per comic   mean ${usd(c.mean)}  median ${usd(c.median)}  p90 ${usd(c.p90)}  min ${usd(c.min)}  max ${usd(c.max)}`);
  console.log(`  per panel   mean ${usd(report.perPanel.mean)}  (${report.panelsPerComic.mean} panels a comic)`);
  console.log(`  per step    ${Object.entries(report.perStep).map(([step, v]) => `${step} ${usd(v)}`).join(", ") || "none yet"}`);
  console.log(`  calls       ${Object.entries(report.callsPerComic).map(([kind, n]) => `${kind} ${n}`).join(", ") || "none yet"} per comic`);
  for (const [style, s] of Object.entries(report.perStyle)) console.log(`  ${style.padEnd(11)} ${s.n} comics, mean ${usd(s.mean)}`);
  console.log(`  cast work   ${usd(report.onboardingPerAccount.mean)} mean per account that drew any (${report.onboardingPerAccount.n})`);
  for (const [month, m] of Object.entries(report.byMonth)) console.log(`  ${month}     ${m.comics} comics, ${usd(m.usd)}`);
  console.log(`  everything  ${usd(report.total)}`);
}
