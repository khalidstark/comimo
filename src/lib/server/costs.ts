import "server-only";
import { randomBytes } from "node:crypto";
import { isArtStyleId, type ArtStyleId } from "@/lib/artStyles";
import { COMIC_STEPS, CALL_KINDS, COST_STEPS, addCosts, emptyCost, parseCost, roundUsd, type CostRecord, type CostStep } from "@/lib/costs";
import { getKV, type KV } from "./kv";

/**
 * The cost ledger: what every metered request cost, per account, kept on the
 * server so the numbers survive a client that lies, a deleted day or a
 * cleared device. Written by the spending guard after each response (see
 * guard.ts), read by the account page and the owner's analytics.
 *
 * Nothing about the story is stored: a day id, the route, the art style, the
 * panel index, dollars and call counts.
 *
 * KV:
 *   cost:<account>              hash  "<dayId|->|<requestId>" -> LedgerEntry JSON (one field per request, so writers never clash)
 *   cost:<account>:m:<YYYY-MM>  counter of micro-dollars spent that month (all routes)
 *   cost:<account>:months       hash  month -> "1" (which counters exist, for deletion)
 *   cost:accounts               hash  account -> first entry time (for the analytics)
 */

/** The routes that write the ledger (the guard's actions). */
export type LedgerAction = "transcribe" | "script" | "panel" | "character" | "sprite" | "photo" | "cover" | "caption" | "wardrobe" | "outfit" | "week";

export interface LedgerEntry {
  /** The comic (day id) this was for; missing for cast work outside a comic (onboarding, the cast page). */
  d?: string;
  a: LedgerAction;
  u: number;
  c: CostRecord["calls"];
  b: CostRecord["byStep"];
  /** Art style of a panel, outfit or sheet. */
  s?: ArtStyleId;
  /** Panel index (panel requests). */
  p?: number;
  t: string;
}

const keys = {
  entries: (account: string) => `cost:${account}`,
  month: (account: string, month: string) => `cost:${account}:m:${month}`,
  months: (account: string) => `cost:${account}:months`,
  accounts: "cost:accounts",
};

const ACTIONS: LedgerAction[] = ["transcribe", "script", "panel", "character", "sprite", "photo", "cover", "caption", "wardrobe", "outfit", "week"];
/** Same shape as library record ids (uuids, "nour"). */
const DAY_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,99}$/;

export function isLedgerDayId(value: unknown): value is string {
  return typeof value === "string" && DAY_ID.test(value);
}

/** File one request's cost under the account. Zero-cost requests (mock, refused before sending) aren't kept. */
export async function recordCost(
  account: string,
  entry: { dayId?: string | null; action: LedgerAction; cost: CostRecord; style?: ArtStyleId; panel?: number },
  kv: KV = getKV(),
  now = new Date(),
): Promise<void> {
  const calls = Object.values(entry.cost.calls).reduce((sum, n) => sum + (n ?? 0), 0);
  if (entry.cost.usd <= 0 && calls === 0) return;
  const dayId = entry.dayId && isLedgerDayId(entry.dayId) ? entry.dayId : undefined;
  const record: LedgerEntry = {
    ...(dayId ? { d: dayId } : {}),
    a: entry.action,
    u: roundUsd(entry.cost.usd),
    c: entry.cost.calls,
    b: entry.cost.byStep,
    ...(entry.style ? { s: entry.style } : {}),
    ...(typeof entry.panel === "number" ? { p: entry.panel } : {}),
    t: now.toISOString(),
  };
  const month = record.t.slice(0, 7);
  await Promise.all([
    kv.hset(keys.entries(account), `${dayId ?? "-"}|${randomBytes(6).toString("base64url")}`, JSON.stringify(record)),
    kv.incr(keys.month(account, month), { by: Math.round(record.u * 1e6) }),
    kv.hset(keys.months(account), month, "1"),
    kv.hget(keys.accounts, account).then((seen) => (seen ? undefined : kv.hset(keys.accounts, account, record.t))),
  ]);
}

function parseEntry(raw: string): LedgerEntry | null {
  try {
    const value = JSON.parse(raw) as Partial<LedgerEntry>;
    if (!ACTIONS.includes(value.a as LedgerAction) || typeof value.t !== "string") return null;
    const cost = parseCost({ usd: value.u, calls: value.c, byStep: value.b });
    if (!cost) return null;
    return {
      ...(isLedgerDayId(value.d) ? { d: value.d } : {}),
      a: value.a as LedgerAction,
      u: cost.usd,
      c: cost.calls,
      b: cost.byStep,
      ...(isArtStyleId(value.s) ? { s: value.s } : {}),
      ...(typeof value.p === "number" && Number.isInteger(value.p) ? { p: value.p } : {}),
      t: value.t,
    };
  } catch {
    return null;
  }
}

/** Every entry the account has. */
export async function ledgerOf(account: string, kv: KV = getKV()): Promise<LedgerEntry[]> {
  return Object.values(await kv.hgetall(keys.entries(account))).flatMap((raw) => parseEntry(raw) ?? []);
}

/** Accounts with at least one entry. */
export async function ledgerAccounts(kv: KV = getKV()): Promise<string[]> {
  return Object.keys(await kv.hgetall(keys.accounts));
}

/** Dollars spent in a month (YYYY-MM), from the running counter. */
export async function monthTotal(account: string, month: string, kv: KV = getKV()): Promise<number> {
  return roundUsd((Number.parseInt((await kv.get(keys.month(account, month))) ?? "0", 10) || 0) / 1e6);
}

/**
 * Account deletion: the account's cost rows (no story, no names: day ids,
 * routes and dollars) move under a fresh random id with no link to the old
 * account, so the totals still count; the account's own keys are removed.
 * Safe to run again.
 */
export async function detachLedger(account: string, kv: KV = getKV()): Promise<void> {
  const entries = await kv.hgetall(keys.entries(account));
  const fields = Object.entries(entries);
  if (fields.length > 0) {
    const anonymous = `gone-${randomBytes(9).toString("base64url")}`;
    await Promise.all(fields.map(([field, value]) => kv.hset(keys.entries(anonymous), field, value)));
    await kv.hset(keys.accounts, anonymous, new Date().toISOString());
  }
  const months = Object.keys(await kv.hgetall(keys.months(account)));
  await Promise.all([...months.map((month) => kv.del(keys.month(account, month))), kv.del(keys.months(account)), kv.del(keys.entries(account))]);
  await kv.hdel(keys.accounts, account);
}

/* ---------- Summaries (pure) ---------- */

/** One comic as the ledger saw it. */
export interface ComicLedger {
  dayId: string;
  cost: CostRecord;
  /** Distinct panels drawn. */
  panels: number;
  style: ArtStyleId | null;
  /** Month of its first entry. */
  month: string;
  /** Requests made for it (retries included). */
  requests: number;
}

export interface AccountSummary {
  /** Comics with at least one panel drawn. */
  comics: ComicLedger[];
  /** Days that never got a panel (stopped early, or a crisis note). */
  unfinished: number;
  /** Cast work outside comics: sheets, photos, sprites, wardrobe. */
  setup: CostRecord;
  /** Covers and captions. */
  extras: CostRecord;
  total: CostRecord;
}

const SETUP: LedgerAction[] = ["character", "photo", "sprite", "wardrobe"];

const asCost = (entry: LedgerEntry): CostRecord => ({ usd: entry.u, calls: entry.c, byStep: entry.b });

export function summarizeAccount(entries: LedgerEntry[]): AccountSummary {
  const byDay = new Map<string, LedgerEntry[]>();
  let setup = emptyCost();
  let extras = emptyCost();
  let total = emptyCost();
  for (const entry of entries) {
    total = addCosts(total, asCost(entry));
    if (entry.d) {
      byDay.set(entry.d, [...(byDay.get(entry.d) ?? []), entry]);
    } else if (SETUP.includes(entry.a)) {
      setup = addCosts(setup, asCost(entry));
    } else {
      extras = addCosts(extras, asCost(entry));
    }
  }
  const comics: ComicLedger[] = [];
  let unfinished = 0;
  for (const [dayId, list] of byDay) {
    const panels = new Set(list.filter((entry) => entry.a === "panel" && entry.p !== undefined).map((entry) => entry.p));
    if (panels.size === 0) {
      unfinished += 1;
      continue;
    }
    const styles = list.filter((entry) => entry.a === "panel" && entry.s).map((entry) => entry.s!);
    comics.push({
      dayId,
      cost: list.reduce<CostRecord>((sum, entry) => addCosts(sum, asCost(entry)), emptyCost()),
      panels: panels.size,
      style: styles[0] ?? null,
      month: list.map((entry) => entry.t).sort()[0].slice(0, 7),
      requests: list.length,
    });
  }
  comics.sort((a, b) => a.month.localeCompare(b.month) || a.dayId.localeCompare(b.dayId));
  return { comics, unfinished, setup, extras, total };
}

/** Summary statistics of a list of dollar amounts. */
export interface Stats {
  n: number;
  total: number;
  mean: number;
  median: number;
  p90: number;
  min: number;
  max: number;
}

export function stats(values: number[]): Stats {
  const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  const n = sorted.length;
  if (n === 0) return { n: 0, total: 0, mean: 0, median: 0, p90: 0, min: 0, max: 0 };
  const total = sorted.reduce((sum, v) => sum + v, 0);
  // Nearest-rank percentiles: the value at or above that share of the list.
  const rank = (p: number) => sorted[Math.min(n - 1, Math.max(0, Math.ceil(p * n) - 1))];
  const r = (v: number) => roundUsd(v);
  return { n, total: r(total), mean: r(total / n), median: r(n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2), p90: r(rank(0.9)), min: r(sorted[0]), max: r(sorted[n - 1]) };
}

export interface CostAggregate {
  accounts: number;
  comics: number;
  unfinished: number;
  perComic: Stats;
  perPanel: Stats;
  panelsPerComic: Stats;
  /** Mean dollars per comic for each step, over all comics (0 where a comic had none). */
  perStep: Partial<Record<CostStep, number>>;
  /** Calls per comic, mean. */
  callsPerComic: Partial<Record<(typeof CALL_KINDS)[number], number>>;
  perStyle: Partial<Record<ArtStyleId, Stats>>;
  /** Cast work outside comics, per account that did any. */
  onboardingPerAccount: Stats;
  extras: number;
  total: number;
  byMonth: Record<string, { comics: number; usd: number }>;
}

/** The owner's view across accounts (no account ids in it). */
export function aggregateCosts(summaries: AccountSummary[]): CostAggregate {
  const comics = summaries.flatMap((summary) => summary.comics);
  const perStep: Partial<Record<CostStep, number>> = {};
  for (const step of COST_STEPS) {
    const sum = comics.reduce((acc, comic) => acc + (comic.cost.byStep[step] ?? 0), 0);
    if (sum > 0) perStep[step] = roundUsd(sum / comics.length);
  }
  // Keep the comic steps in pipeline order first.
  const ordered: Partial<Record<CostStep, number>> = {};
  for (const step of [...COMIC_STEPS, ...COST_STEPS]) if (perStep[step] !== undefined && ordered[step] === undefined) ordered[step] = perStep[step];
  const callsPerComic: CostAggregate["callsPerComic"] = {};
  for (const kind of CALL_KINDS) {
    const sum = comics.reduce((acc, comic) => acc + (comic.cost.calls[kind] ?? 0), 0);
    if (sum > 0) callsPerComic[kind] = Math.round((sum / comics.length) * 10) / 10;
  }
  const perStyle: CostAggregate["perStyle"] = {};
  for (const style of new Set(comics.flatMap((comic) => (comic.style ? [comic.style] : [])))) {
    perStyle[style] = stats(comics.filter((comic) => comic.style === style).map((comic) => comic.cost.usd));
  }
  const byMonth: CostAggregate["byMonth"] = {};
  for (const comic of comics) {
    const month = (byMonth[comic.month] ??= { comics: 0, usd: 0 });
    month.comics += 1;
    month.usd = roundUsd(month.usd + comic.cost.usd);
  }
  return {
    accounts: summaries.length,
    comics: comics.length,
    unfinished: summaries.reduce((sum, summary) => sum + summary.unfinished, 0),
    perComic: stats(comics.map((comic) => comic.cost.usd)),
    perPanel: stats(comics.map((comic) => comic.cost.usd / comic.panels)),
    panelsPerComic: stats(comics.map((comic) => comic.panels)),
    perStep: ordered,
    callsPerComic,
    perStyle,
    onboardingPerAccount: stats(summaries.filter((summary) => summary.setup.usd > 0).map((summary) => summary.setup.usd)),
    extras: roundUsd(summaries.reduce((sum, summary) => sum + summary.extras.usd, 0)),
    total: roundUsd(summaries.reduce((sum, summary) => sum + summary.total.usd, 0)),
    byMonth,
  };
}
