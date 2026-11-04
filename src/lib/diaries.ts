import { getMeta, newId, setMeta } from "./store";
import { DIARY_COLORS, DIARY_STICKERS, type Day, type Diary, type DiaryColor, type DiarySticker } from "./types";

/**
 * Diaries (03.2-05): notebooks the user names themselves and writes in any
 * day. The list is the synced setting `diaries` (JSON); a comic belongs to
 * one through `Day.diaryId`. "Every day" is built in: every comic without a
 * diary (all comics made before diaries).
 */

export const DIARIES_KEY = "diaries";
export const MAX_DIARIES = 12;
export const DIARY_NAME_MAX = 40;
/** The built-in daily diary's id in links (/diaries?d=every-day). */
export const EVERY_DAY = "every-day";

/** Names to start from, with a cover each. */
export const DIARY_SUGGESTIONS: { name: string; color: DiaryColor; sticker: DiarySticker }[] = [
  { name: "Things I love", color: "pink", sticker: "heart" },
  { name: "Bad things", color: "ink", sticker: "rain" },
  { name: "Small wins", color: "sun", sticker: "star" },
  { name: "Dreams", color: "lilac", sticker: "moon" },
  { name: "Firsts", color: "teal", sticker: "spark" },
  { name: "Growing", color: "grass", sticker: "leaf" },
];

const tidy = (text: string) => text.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();

/** Why a name can't be used, or null when it can. */
export function diaryNameProblem(name: string, others: Diary[], selfId?: string): string | null {
  const clean = tidy(name);
  if (!clean) return "Give it a name.";
  if (clean.length > DIARY_NAME_MAX) return `Keep the name under ${DIARY_NAME_MAX} characters.`;
  const lower = clean.toLocaleLowerCase();
  if (lower === "every day") return "Every day is already your daily diary.";
  if (others.some((d) => d.id !== selfId && d.name.toLocaleLowerCase() === lower)) return `You already have “${clean}”.`;
  return null;
}

/** The stored list, cleaned: unknown fields dropped, bad entries skipped (old or tampered settings). */
export function parseDiaries(raw: unknown): Diary[] {
  let value: unknown = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const diaries: Diary[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null) continue;
    const { id, name, color, sticker, createdAt } = item as Record<string, unknown>;
    if (typeof id !== "string" || !/^[A-Za-z0-9-]{1,64}$/.test(id) || seen.has(id) || id === EVERY_DAY) continue;
    if (typeof name !== "string" || !tidy(name)) continue;
    seen.add(id);
    diaries.push({
      id,
      name: tidy(name).slice(0, DIARY_NAME_MAX),
      color: DIARY_COLORS.includes(color as DiaryColor) ? (color as DiaryColor) : "pink",
      sticker: DIARY_STICKERS.includes(sticker as DiarySticker) ? (sticker as DiarySticker) : "heart",
      createdAt: typeof createdAt === "string" ? createdAt : new Date(0).toISOString(),
    });
    if (diaries.length >= MAX_DIARIES) break;
  }
  return diaries;
}

/**
 * The comics in a diary (EVERY_DAY: those without one, or whose diary was deleted), newest first.
 * A note Comimo didn't draw (a crisis note) is not a comic: it never shows on a shelf or in a count.
 */
export function daysIn(diaryId: string, days: Day[], diaries: Diary[]): Day[] {
  const known = new Set(diaries.map((d) => d.id));
  return days
    .filter((day) => !day.sample && day.safety !== "crisis" && day.panels.length > 0)
    .filter((day) => (diaryId === EVERY_DAY ? !day.diaryId || !known.has(day.diaryId) : day.diaryId === diaryId))
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
}

/* ---------- Stored list ---------- */

export async function loadDiaries(): Promise<Diary[]> {
  return parseDiaries(await getMeta(DIARIES_KEY));
}

async function saveDiaries(diaries: Diary[]): Promise<boolean> {
  return setMeta(DIARIES_KEY, JSON.stringify(diaries));
}

export class DiaryError extends Error {
  name = "DiaryError";
}

/** Make a diary; throws DiaryError with a message for the form. */
export async function createDiary(input: { name: string; color: DiaryColor; sticker: DiarySticker }): Promise<Diary> {
  const diaries = await loadDiaries();
  if (diaries.length >= MAX_DIARIES) throw new DiaryError(`You can keep up to ${MAX_DIARIES} diaries.`);
  const problem = diaryNameProblem(input.name, diaries);
  if (problem) throw new DiaryError(problem);
  const diary: Diary = { id: newId(), name: tidy(input.name), color: input.color, sticker: input.sticker, createdAt: new Date().toISOString() };
  if (!(await saveDiaries([...diaries, diary]))) throw new DiaryError("This browser isn't letting Comimo save right now.");
  return diary;
}

export async function updateDiary(id: string, change: Partial<Pick<Diary, "name" | "color" | "sticker">>): Promise<Diary> {
  const diaries = await loadDiaries();
  const current = diaries.find((d) => d.id === id);
  if (!current) throw new DiaryError("That diary isn't here any more.");
  if (change.name !== undefined) {
    const problem = diaryNameProblem(change.name, diaries, id);
    if (problem) throw new DiaryError(problem);
  }
  const next: Diary = { ...current, ...change, ...(change.name !== undefined ? { name: tidy(change.name) } : {}) };
  if (!(await saveDiaries(diaries.map((d) => (d.id === id ? next : d))))) throw new DiaryError("This browser isn't letting Comimo save right now.");
  return next;
}

/** Remove a diary. Its comics stay, and show in Every day again. */
export async function deleteDiary(id: string): Promise<void> {
  const diaries = await loadDiaries();
  if (!(await saveDiaries(diaries.filter((d) => d.id !== id)))) throw new DiaryError("This browser isn't letting Comimo save right now.");
}
