import { getMeta, setMeta } from "./store";
import type { ApiError, Day, IsoDate, WeekRequest, WeekResponse, WeekSummary } from "./types";

/**
 * The week's good things (03.2-05): the comics of this week (Saturday to
 * Friday, local time, as weeks run in Egypt and on the home page's week strip) go to /api/week, Muse Spark writes what went well and
 * what the user did, and the answer is kept as the synced setting
 * `week:<monday>`. Crisis days are never sent.
 */

/** Characters of each comic's own words sent (the transcript). */
export const WEEK_TEXT_MAX = 1500;
/** Comics a week summary reads. */
export const WEEK_MAX_DAYS = 14;

/** A local date as YYYY-MM-DD. */
function localIsoDate(date: Date): IsoDate {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}

export const weekKey = (monday: IsoDate) => `week:${monday}`;

/** The Saturday that starts the week `date` is in, as YYYY-MM-DD in local time. */
export function weekStart(date = new Date()): IsoDate {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const back = (d.getDay() + 1) % 7;
  d.setDate(d.getDate() - back);
  return localIsoDate(d);
}

/** The Friday that ends the week starting on `monday` (the week's first day). */
export function weekEnd(monday: IsoDate): IsoDate {
  const [y, m, d] = monday.split("-").map(Number);
  return localIsoDate(new Date(y, m - 1, d + 6));
}

/** This week's comics, oldest first: not samples, not crisis notes, nothing without a comic. */
export function weekDays(days: Day[], monday: IsoDate): Day[] {
  const sunday = weekEnd(monday);
  return days
    .filter((day) => !day.sample && day.safety !== "crisis" && day.panels.length > 0 && day.date >= monday && day.date <= sunday)
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt))
    .slice(-WEEK_MAX_DAYS);
}

/** What /api/week gets for each comic: its date, title and the user's own words, cut short. */
export function weekPayload(days: Day[], monday: IsoDate): WeekRequest {
  return {
    week: monday,
    days: days.map((day) => ({ id: day.id, date: day.date, title: day.title.slice(0, 120), text: day.transcript.replace(/\s+/g, " ").trim().slice(0, WEEK_TEXT_MAX) })),
  };
}

/** True when comics came (or went) since the summary was written. */
export function isStale(summary: WeekSummary, days: Day[]): boolean {
  const now = new Set(days.map((day) => day.id));
  return summary.dayIds.length !== now.size || summary.dayIds.some((id) => !now.has(id));
}

export function parseWeek(raw: unknown): WeekSummary | null {
  if (typeof raw !== "string") return null;
  try {
    const value = JSON.parse(raw) as WeekSummary;
    if (typeof value.headline !== "string" || !Array.isArray(value.goodThings) || !Array.isArray(value.dayIds)) return null;
    return value;
  } catch {
    return null;
  }
}

export async function loadWeek(monday: IsoDate): Promise<WeekSummary | null> {
  return parseWeek(await getMeta(weekKey(monday)));
}

export class WeekError extends Error {
  name = "WeekError";
}

/** Ask Muse Spark for the week's good things and keep the answer with the account. */
export async function writeWeek(days: Day[], monday: IsoDate, signal?: AbortSignal): Promise<WeekSummary> {
  let response: Response;
  try {
    response = await fetch("/api/week", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(weekPayload(days, monday)),
      signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new WeekError("Couldn't reach Comimo. Check your connection and try again.");
  }
  const result = (await response.json().catch(() => null)) as WeekResponse | ApiError | null;
  if (!response.ok || !result || !("goodThings" in result)) {
    throw new WeekError((result as ApiError | null)?.error || `The week didn't come together (${response.status}). Try again.`);
  }
  const summary: WeekSummary = {
    week: monday,
    headline: result.headline,
    goodThings: result.goodThings,
    line: result.line,
    dayIds: days.map((day) => day.id),
    mode: result.mode,
    writtenAt: new Date().toISOString(),
  };
  await setMeta(weekKey(monday), JSON.stringify(summary));
  return summary;
}
