import { countWord, moodWords } from "../format";
import { MOODS, type CharacterRole, type Day, type MonthKey, type Mood } from "../types";

/**
 * The month as a printed issue: which pages it has, in what order, and how
 * they pair into spreads. Pure functions, so the server can lay out the
 * sample issue and the browser can lay out a month read from IndexedDB the
 * same way.
 *
 * Page order: front cover, contents (one or more pages), the month's weather,
 * every comic page in date order, a "next issue" page when the inside would
 * otherwise be odd, then the back cover. With the inside always even, the
 * front cover sits alone on the right and the back cover alone on the left,
 * like a real magazine lying closed.
 */

/** What the issue needs to know about one day. */
export interface IssueDayInfo {
  id: string;
  date: string;
  title: string;
  mood: Mood;
  /** Number of comic pages (1 to 3). */
  pageCount: number;
  /** Everyone drawn in or speaking in the comic. */
  castIds: string[];
}

export interface CastInfo {
  id: string;
  name: string;
  role: CharacterRole;
}

export interface ContentsEntry {
  dayIndex: number;
  /** Folio (printed page number) of the day's first page. */
  folio: number;
}

export type IssuePage =
  | { kind: "cover" }
  | { kind: "contents"; part: number; parts: number; entries: ContentsEntry[] }
  | { kind: "weather" }
  | { kind: "comic"; dayIndex: number; page: number }
  | { kind: "next" }
  | { kind: "back" };

/** Contents entries per contents page; more days run onto another page. */
export const CONTENTS_PER_PAGE = 9;

/** All pages of the issue, front cover first. A page's folio is its index + 1. */
export function issuePages(days: Pick<IssueDayInfo, "pageCount">[]): IssuePage[] {
  const parts = Math.max(1, Math.ceil(days.length / CONTENTS_PER_PAGE));
  const comicsStart = 1 + parts + 1; // after the cover, the contents and the weather page
  const firstFolio: number[] = [];
  let folio = comicsStart + 1;
  for (const day of days) {
    firstFolio.push(folio);
    folio += Math.max(1, day.pageCount);
  }

  const pages: IssuePage[] = [{ kind: "cover" }];
  for (let part = 0; part < parts; part++) {
    const entries = days
      .slice(part * CONTENTS_PER_PAGE, (part + 1) * CONTENTS_PER_PAGE)
      .map((_, i) => ({ dayIndex: part * CONTENTS_PER_PAGE + i, folio: firstFolio[part * CONTENTS_PER_PAGE + i] }));
    pages.push({ kind: "contents", part, parts, entries });
  }
  pages.push({ kind: "weather" });
  days.forEach((day, dayIndex) => {
    for (let page = 0; page < Math.max(1, day.pageCount); page++) pages.push({ kind: "comic", dayIndex, page });
  });
  // Inside pages (everything between the covers) must be even so the back cover lands alone on the left.
  if ((pages.length - 1) % 2 === 1) pages.push({ kind: "next" });
  pages.push({ kind: "back" });
  return pages;
}

/** A view of the open magazine: page indexes on the left and right, null for an empty side. */
export interface Spread {
  left: number | null;
  right: number | null;
}

/**
 * How pages pair up. Two-up: the cover alone on the right, then (1, 2),
 * (3, 4) and so on, the back cover alone on the left. One-up: one page per view.
 */
export function spreadsFor(pageCount: number, twoUp: boolean): Spread[] {
  if (pageCount <= 0) return [];
  if (!twoUp) return Array.from({ length: pageCount }, (_, i) => ({ left: null, right: i }));
  const spreads: Spread[] = [{ left: null, right: 0 }];
  for (let left = 1; left < pageCount; left += 2) {
    spreads.push({ left, right: left + 1 < pageCount ? left + 1 : null });
  }
  return spreads;
}

/** The view that shows a page. */
export function spreadOf(page: number, twoUp: boolean): number {
  if (!twoUp) return page;
  return page === 0 ? 0 : Math.floor((page + 1) / 2);
}

/* ---------- The month in words ---------- */

/** How many days each character is in, most first (ties keep cast order). */
export function castAppearances(days: Pick<IssueDayInfo, "castIds">[], cast: CastInfo[]): { member: CastInfo; days: number }[] {
  const counts = new Map<string, number>();
  for (const day of days) for (const id of new Set(day.castIds)) counts.set(id, (counts.get(id) ?? 0) + 1);
  return cast
    .map((member, order) => ({ member, days: counts.get(member.id) ?? 0, order }))
    .filter((entry) => entry.days > 0)
    .sort((a, b) => b.days - a.days || a.order - b.order)
    .map(({ member, days }) => ({ member, days }));
}

/** The month's main cast for the cover: the most-seen characters, the narrator first when they appear at all. */
export function mainCast(days: Pick<IssueDayInfo, "castIds">[], cast: CastInfo[], limit = 3): CastInfo[] {
  const ranked = castAppearances(days, cast).map((entry) => entry.member);
  const self = ranked.filter((member) => member.role === "self").slice(0, 1);
  const others = ranked.filter((member) => !self.includes(member));
  return [...self, ...others].slice(0, limit);
}

/** Weather counts, most common first (ties in the usual weather order). */
export function weatherCounts(days: Pick<IssueDayInfo, "mood">[]): { mood: Mood; days: number }[] {
  return MOODS.map((mood) => ({ mood, days: days.filter((day) => day.mood === mood).length }))
    .filter((entry) => entry.days > 0)
    .sort((a, b) => b.days - a.days || MOODS.indexOf(a.mood) - MOODS.indexOf(b.mood));
}

function list(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * The back cover's lines: only counts of days, weather and who was there,
 * never a score. E.g. ["Eleven days.", "Four rainy, three sunny and two cloudy.", "Karim was in seven, Teta Samia in three."]
 */
export function monthInWords(days: IssueDayInfo[], cast: CastInfo[]): string[] {
  if (days.length === 0) return [];
  const lines = [`${capitalise(countWord(days.length))} day${days.length === 1 ? "" : "s"}.`];

  const weather = weatherCounts(days).slice(0, 3);
  if (weather.length === 1) {
    lines.push(days.length === 1 ? `${moodWords[weather[0].mood]}.` : `Every one of them ${moodWords[weather[0].mood].toLowerCase()}.`);
  } else {
    lines.push(`${capitalise(list(weather.map((w) => `${countWord(w.days)} ${moodWords[w.mood].toLowerCase()}`)))}.`);
  }

  // The narrator is in nearly every comic; the line is about who else was there.
  const others = castAppearances(days, cast)
    .filter((entry) => entry.member.role !== "self")
    .slice(0, 2);
  if (others.length > 0) {
    const [first, second] = others;
    const firstPart = `${first.member.name} was in ${first.days === days.length ? (days.length === 1 ? "it" : "all of them") : countWord(first.days)}`;
    lines.push(second ? `${firstPart}, ${second.member.name} in ${countWord(second.days)}.` : `${firstPart}.`);
  }

  const pages = days.reduce((total, day) => total + Math.max(1, day.pageCount), 0);
  if (pages > days.length) lines.push(`${capitalise(countWord(pages))} pages of comics.`);
  return lines;
}

/* ---------- Months ---------- */

export function monthOf(date: string): MonthKey {
  return date.slice(0, 7);
}

const monthFormat = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
const monthOnly = new Intl.DateTimeFormat("en-GB", { month: "long", timeZone: "UTC" });

/** "October 2026". */
export function monthLabel(month: MonthKey): string {
  return monthFormat.format(new Date(`${month}-01T00:00:00Z`));
}

/** "October". */
export function monthName(month: MonthKey): string {
  return monthOnly.format(new Date(`${month}-01T00:00:00Z`));
}

/** The month after, as a name ("November"). */
export function nextMonthName(month: MonthKey): string {
  const [year, m] = month.split("-").map(Number);
  return monthOnly.format(new Date(Date.UTC(year, m, 1)));
}

/** Days that belong in an issue: real comics only (no crisis notes, no sample days kept for their answers). */
export function issueDays(days: Day[]): Day[] {
  return days
    .filter((day) => !day.sample && day.safety !== "crisis" && day.panels.length > 0)
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
}

/** Months that have at least one comic, oldest first; a month's issue number is its place in this list. */
export function issueMonths(days: Day[]): MonthKey[] {
  return [...new Set(issueDays(days).map((day) => monthOf(day.date)))].sort();
}

/** Everyone drawn or speaking in a day's comic. */
export function dayCastIds(day: Pick<Day, "panels">): string[] {
  const ids = new Set<string>();
  for (const panel of day.panels) {
    for (const id of panel.characterIds) ids.add(id);
    for (const line of panel.dialogue) ids.add(line.speakerId);
  }
  return [...ids];
}
