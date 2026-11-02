/**
 * Cost records: what a request, a comic or a character cost in model calls.
 * Shared by the server (the meter adds up each request), the browser (the
 * pipeline adds up a comic) and the ledger. Pure: no network, no storage.
 */

/** Kinds of billed call. */
export const CALL_KINDS = ["spark", "image", "sam", "transcribe"] as const;
export type CallKind = (typeof CALL_KINDS)[number];

/**
 * Where money went. A comic's steps: transcribe, script, outfit (today's
 * clothes from photos), sheets (a cast member drawn for the first time
 * mid-comic), panels (first drawings, softened retries included), faceCheck
 * (SAM and the Spark judge), redraws (face fixes and their checks).
 * Outside comics: sheet, photo, sprite, wardrobe, cover, caption.
 */
export const COST_STEPS = [
  "transcribe",
  "script",
  "outfit",
  "sheets",
  "panels",
  "faceCheck",
  "redraws",
  "sheet",
  "photo",
  "sprite",
  "wardrobe",
  "cover",
  "caption",
] as const;
export type CostStep = (typeof COST_STEPS)[number];

/** The steps of one comic, in the order they run (for display and the report). */
export const COMIC_STEPS = ["transcribe", "outfit", "script", "sheets", "panels", "faceCheck", "redraws"] as const satisfies readonly CostStep[];

/** What some model calls cost: dollars, calls by kind, dollars by step. */
export interface CostRecord {
  usd: number;
  calls: Partial<Record<CallKind, number>>;
  byStep: Partial<Record<CostStep, number>>;
}

/** A comic's cost, kept on the Day. */
export interface ComicCost extends CostRecord {
  /** The model versions the prices were for. */
  models: Record<string, string>;
  /** True when made in practice mode (no model was called). */
  mock?: boolean;
  createdAt: string;
}

export function emptyCost(): CostRecord {
  return { usd: 0, calls: {}, byStep: {} };
}

/** Dollars kept to a millionth, so sums don't grow float noise. */
export function roundUsd(usd: number): number {
  return Math.round(usd * 1e6) / 1e6;
}

/** Add one billed call to a record (in place). */
export function charge(record: CostRecord, kind: CallKind, usd: number, step: CostStep): void {
  const amount = Number.isFinite(usd) && usd > 0 ? usd : 0;
  record.usd = roundUsd(record.usd + amount);
  record.calls[kind] = (record.calls[kind] ?? 0) + 1;
  record.byStep[step] = roundUsd((record.byStep[step] ?? 0) + amount);
}

/** a + b, as a new record. */
export function addCosts(a: CostRecord | null | undefined, b: CostRecord | null | undefined): CostRecord {
  const sum = emptyCost();
  for (const record of [a, b]) {
    if (!record) continue;
    sum.usd = roundUsd(sum.usd + (Number.isFinite(record.usd) ? record.usd : 0));
    for (const [kind, n] of Object.entries(record.calls ?? {})) {
      if (typeof n === "number" && Number.isFinite(n)) sum.calls[kind as CallKind] = (sum.calls[kind as CallKind] ?? 0) + n;
    }
    for (const [step, usd] of Object.entries(record.byStep ?? {})) {
      if (typeof usd === "number" && Number.isFinite(usd)) sum.byStep[step as CostStep] = roundUsd((sum.byStep[step as CostStep] ?? 0) + usd);
    }
  }
  return sum;
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value < 1e6;
}

/**
 * A cost record from untrusted JSON (a response header, a stored record), or
 * null. Unknown kinds and steps are dropped; amounts must be small and positive.
 */
export function parseCost(value: unknown): CostRecord | null {
  if (typeof value !== "object" || value === null) return null;
  const { usd, calls, byStep } = value as Record<string, unknown>;
  if (!isCount(usd) || usd > 100) return null;
  const record = emptyCost();
  record.usd = roundUsd(usd);
  if (typeof calls === "object" && calls !== null) {
    for (const kind of CALL_KINDS) {
      const n = (calls as Record<string, unknown>)[kind];
      if (isCount(n)) record.calls[kind] = Math.round(n);
    }
  }
  if (typeof byStep === "object" && byStep !== null) {
    for (const step of COST_STEPS) {
      const n = (byStep as Record<string, unknown>)[step];
      if (isCount(n) && n <= 100) record.byStep[step] = roundUsd(n);
    }
  }
  return record;
}

/** The response header every metered route answers with: that request's cost as JSON. */
export const COST_HEADER = "X-Comimo-Cost";
/** The request header naming the comic (day id) a model call is for, so the server ledger can file it. */
export const DAY_HEADER = "X-Comimo-Day";

/** The cost a metered route answered with (X-Comimo-Cost), or null without one. */
export function costFromResponse(response: Response): CostRecord | null {
  const header = response.headers.get(COST_HEADER);
  if (!header) return null;
  try {
    return parseCost(JSON.parse(header));
  } catch {
    return null;
  }
}

/**
 * "about $0.07" for people: whole cents from a cent up, "less than a cent"
 * below, "nothing" for zero.
 */
export function aboutUsd(usd: number): string {
  if (!Number.isFinite(usd) || usd <= 0) return "nothing";
  if (usd < 0.005) return "less than a cent";
  return `about $${usd < 10 ? usd.toFixed(2) : usd.toFixed(0)}`;
}
